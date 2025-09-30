import { Art, Layout } from "./gallery-image.js";
import { existsSync, rmSync, mkdirSync, createWriteStream } from "fs";
import sharp from "sharp";
import { cleanTrailingSlash } from "./Util.js";
import { Console, log } from "console";

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

        const noteImageSize = this.layout.noteImageSize;

        console.log('Beginning stitched image generation...');

        const totalEstimate = this.layout.numRows * this.layout.numCols;
        let totalCount = 0, totalDone = 0;

        for (const row of this.layout.array) for (const item of row) totalCount++;

        const blocks: ArtBlock[] = [];

        this.layout.array.forEach(async (row, y, array) => {
            row.forEach(async (artObject, x, row) => {
                // Every 10 times this runs is approx. 45s
                try {
                    const art = new Art(artObject);

                    if (!art.thumbnailExists(noteImageSize)) {
                        await art.generateThumbnail(noteImageSize, {
                            saveFile: false
                        });
                    }

                    const artBuffer = await art.loadThumbnail(noteImageSize);

                    const artBlock: ArtBlock = {
                        input: artBuffer,
                        top:y*noteImageSize,
                        left:x*noteImageSize
                    }

                    blocks.push(artBlock);

                    totalDone++;
                    if (logLevel !== 'none') console.log(`[${totalDone}/${totalEstimate}] ${art.sourceName} fetched...`);
                }
                catch (e) {
                    totalDone++;
                    if (logLevel !== 'none') console.error(e);
                }
            });
        })

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
                width:noteImageSize*this.layout.numCols,
                height:noteImageSize*this.layout.numRows,
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

        const dirName = cleanTrailingSlash(options.outputDir)
        
        let minimumTileSize = this.layout.noteImageSize - (this.layout.noteImageSize % 16);
        while (minimumTileSize % 16 == 0 && minimumTileSize > 256) minimumTileSize /= 2;

        await sharp(this.buffer).tiff({
            pyramid:true,
            tile:true, // Not sure this flag matters since pyramid is true
            tileWidth: minimumTileSize,
            tileHeight: minimumTileSize
        }).toFile(`${dirName}/${this.name}.tif`);
    }

    async _iiif(options: GenerateImageOptions): Promise<void> {
        const dirName = `${cleanTrailingSlash(options.outputDir)}/${this.name}/`;

        if (existsSync(dirName)) rmSync(dirName, {recursive:true});
        mkdirSync(dirName);

        await sharp(this.buffer).tile({
            layout:'iiif3',
            id:dirName
        }).toFile(dirName);
    }

    async _dzi(options: GenerateImageOptions): Promise<void> {
        const dirName = `${cleanTrailingSlash(options.outputDir)}/${this.name}/`;

        if (existsSync(dirName)) rmSync(dirName, {recursive:true});
        mkdirSync(dirName);

        await sharp(this.buffer).tile({
            layout:'dz',
        }).toFile(dirName);
    }
}