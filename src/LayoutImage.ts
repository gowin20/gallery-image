import { Art, Layout } from "./gallery-image.js";
import { existsSync, rmSync, mkdirSync } from "fs";
import sharp from "sharp";
import { cleanTrailingSlash, setupLogging, log, error } from "./Util.js";
import { imageSize } from 'image-size';
import { GenerateImageOptions } from "./ImageResource.js";

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

    async createLayoutImage (options: GenerateImageOptions): Promise<this> {

        // TODO determine width and height of one input image. Assume all are same size
        const thumbnailSize = this.layout.thumbnailSize;

        const sampleArt = new Art(this.layout.array[0][0]);

        const sampleBuffer = await sampleArt.loadOrCreateThumbnail(thumbnailSize);
        const dimensions = imageSize(sampleBuffer);
        this.artDimensions = {
            width: dimensions.width,
            height: dimensions.height,
            orientation: dimensions.orientation
        };

        const imageWidth = dimensions.width, imageHeight = dimensions.height;

        log('Beginning stitched image generation...');

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

                    const artBuffer = await art.loadOrCreateThumbnail(thumbnailSize);

                    const artBlock: ArtBlock = {
                        input: artBuffer,
                        top:y*imageHeight,
                        left:x*imageWidth
                    }

                    blocks.push(artBlock);
                    log(`[${totalDone+1}/${totalCount}] ${art.sourceName} fetched...`);
                }
                catch (e) {
                    error(e);
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
        log(`Loaded ${totalDone} images. Stitching...`);

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
        log('Layout fully assembled and saved as buffer.');
        return this;
    }

    async generate (options: GenerateImageOptions): Promise<LayoutImage> {
        if (!options.outputType) throw new Error('Must provide output type.');
        if (!options.outputDir) throw new Error('Must provide output directory.');
        if (!options.saveFile) throw new Error('saveFile must be true, generating a layout image will always save a file.');

        // Debug logging
        const logLevel = options.logLevel ? options.logLevel : 'standard';
        setupLogging(logLevel,`${options.outputDir}/${this.layout.name}-generate`);


        if (!this.buffer) {
            log('Layout image needs to be assembled. Starting assembly process...');
            await this.createLayoutImage(options);
        }

        
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
        log(`Generation complete. File(s) saved to ${options.outputDir}.`);
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
        if (!options.id) throw new Error('ID is required when generating IIIF output.')
        const dirName = `${cleanTrailingSlash(options.outputDir)}/${this.name}/`;

        if (existsSync(dirName)) rmSync(dirName, {recursive:true});
        mkdirSync(dirName);

        await sharp(this.buffer, sharpOptions).tile({
            layout:'iiif',
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