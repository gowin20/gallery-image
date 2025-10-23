import { Art, Layout } from "./gallery-image.js";
import { existsSync, rmSync, mkdirSync, createWriteStream } from "fs";
import sharp from "sharp";
import { cleanTrailingSlash } from "./Util.js";
import { Console } from "console";
import { imageSize } from 'image-size';

type ArtBlock = {
    input: Buffer;
    top: number;
    left: number;
}

export type ImageId = string;

export interface ImageObject {
    _id: string;
    type?: "stitch" | "dzi";
    Image: DziImage | StitchedImage;
}

export type DziImage = {
    Url: string;
    xmlns: string;
    Format: "jpeg";
    Overlap: number;
    TileSize: number;
    Size: {
        Width: number;
        Height: number;
    }
}

export type StitchedImage = {
    Path: string;
}

export type GenerateImageOptions = {
    /**
     * Whether to save the output image as a file
     */
    saveFile: boolean;
    /**
     * Output directory
     */
    outputDir?: string;
    /**
     * 
     */
    outputType?: 'tif' | 'tiff' | 'dzi' | 'iiif';
    /**
     * 
     */
    logLevel?: 'none' | 'standard' | 'verbose';
    /**
     * 
     */
    sharpOptions?: any;
}

export class LayoutImage {
    
    layout: Layout;
    name: string;
    buffer?: Buffer;
    artDimensions?: {width:number,height:number,orientation:number};

    constructor(layout: Layout) {

        if (!layout) throw new Error('Image requires a layout');
        this.layout = layout;
        this.name = `${this.layout.name}-stitch`;
    };

    async generate (options: GenerateImageOptions): Promise<LayoutImage> {
        if (!options.outputType) throw new Error('Must provide output type.');
        if (!options.outputDir) throw new Error('Must provide output directory.');
        if (!options.saveFile) throw new Error('saveFile must be true, generating an image will always save a file.');
        const logLevel = options.logLevel ? options.logLevel : 'standard';

        if (logLevel === 'verbose') {
            const logOutput = createWriteStream(`${options.outputDir}/${this.layout.name}-${Date.now()}.log`, {flags: 'a'});
            const logger = new Console(logOutput, logOutput);
            console.log = logger.log;
            console.error = logger.error;
        }
        // TODO determine width and height of one input image. Assume all are same size
        const thumbnailSize = this.layout.thumbnailSize;

        const sampleArt = new Art(this.layout.array[0][0]);

        const sampleBuffer = await sampleArt.loadOrGenerateThumbnail(thumbnailSize);
        const dimensions = imageSize(sampleBuffer);
        this.artDimensions = {
            width: dimensions.width,
            height: dimensions.height,
            orientation: dimensions.orientation
        };

        const imageWidth = dimensions.width, imageHeight = dimensions.height;

        console.log('Beginning stitched image generation...');

        let totalCount = 0, totalDone = 0;
        for (const row of this.layout.array) for (const item of row) totalCount++;

        const blocks: ArtBlock[] = [];

        let y=0;
        for (const row of this.layout.array) {
            let x = 0;
            for (const artObject of row) {
                // Every 10 times this runs is approx. 45s
                try {
                    const art = new Art(artObject);

                    const artBuffer = await art.loadOrGenerateThumbnail(thumbnailSize);

                    const artBlock: ArtBlock = {
                        input: artBuffer,
                        top:y*imageHeight,
                        left:x*imageWidth
                    }

                    blocks.push(artBlock);
                    if (logLevel !== 'none') console.log(`[${totalDone+1}/${totalCount}] ${art.sourceName} fetched...`);
                }
                catch (e) {
                    if (logLevel !== 'none') console.error(e);
                }
                totalDone++;
                x++;
            }
            y++;
        }

        // Wait until all images are processed
        await new Promise((resolve) => {
            const intervalId = setInterval(() => {
                if (totalDone === totalCount) {
                    clearInterval(intervalId);
                    resolve(totalDone);
                };
            }, 100);
        });
        if (logLevel !== 'none') console.log(`Loaded ${totalDone} images. Stitching...`);

        const sharpOptions = options.sharpOptions ? options.sharpOptions : {};

        // Generate large blank image in temp folder
        this.buffer = await sharp({
            create: {
                width:imageWidth * this.layout.numCols,
                height:imageHeight * this.layout.numRows,
                channels: 4,
                background: { r: 48, g: 48, b: 48, alpha: 1 } // #303030 - same as site background
            },
            ...sharpOptions
        }).composite(blocks).tiff({
            quality:100
        }).toBuffer();

        // Generate and save image
        switch (options.outputType) {
            case 'tif':
            case 'tiff':
                await this._tiffWithPyramids(options);
                break;
            case 'iiif':
                await this._iiif(options);
                break;
            case 'dzi':
                await this._dzi(options);
                break;
        }
        if (logLevel !== 'none') console.log(`Pattern fully stitched. File(s) saved to ${options.outputDir}.`);
        return this;
    };

    async _tiffWithPyramids(options: GenerateImageOptions): Promise<void> {

        const sharpOptions = options.sharpOptions ? options.sharpOptions : {};
        const dirName = cleanTrailingSlash(options.outputDir)
        
        const totalWidth = this.layout.numCols * this.artDimensions.width, totalHeight = this.layout.numRows * this.artDimensions.height;;
        const minimumTileWidth = totalWidth > 256 ? 256 : totalWidth - (totalWidth % 16);
        const minimumTileHeight = totalHeight > 256 ? 256 : totalHeight - (totalHeight % 16);
        
        await sharp(this.buffer, sharpOptions).tiff({
            pyramid:true,
            tile:true, // Not sure this flag matters since pyramid is true
            tileWidth: minimumTileWidth,
            tileHeight: minimumTileHeight,
        }).toFile(`${dirName}/${this.name}.tif`);
    }

    async _iiif(options: GenerateImageOptions): Promise<void> {
        const sharpOptions = options.sharpOptions ? options.sharpOptions : {};
        const dirName = `${cleanTrailingSlash(options.outputDir)}/${this.name}/`;

        if (existsSync(dirName)) rmSync(dirName, {recursive:true});
        mkdirSync(dirName);

        await sharp(this.buffer, sharpOptions).tile({
            layout:'iiif3',
            id:dirName
        }).toFile(dirName);
    }

    async _dzi(options: GenerateImageOptions): Promise<void> {
        const sharpOptions = options.sharpOptions ? options.sharpOptions : {};
        const dirName = `${cleanTrailingSlash(options.outputDir)}/${this.name}/`;

        if (existsSync(dirName)) rmSync(dirName, {recursive:true});
        mkdirSync(dirName);

        await sharp(this.buffer, sharpOptions).tile({
            layout:'dz',
        }).toFile(dirName);
    }
}