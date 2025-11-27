import { getResourceBuffer, cleanTrailingSlash, setupLogging, log, validatePath, saveFile, resolvePath } from "./Util.js";
import { Art } from "./gallery-image.js";
import sharp from "sharp";
import { existsSync, rmSync, mkdirSync } from "fs";
import {imageSize} from "image-size";
import type { ContentResource } from "@iiif/presentation-3";
import { GenerateIiifOptions } from "./Art.js";

/**
 * Base options for generating all kinds of images
 */
export type GenerateBaseOptions = {
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
    logLevel?: 'none' | 'standard' | 'verbose';
}

export type GenerateThumbnailOptions = GenerateBaseOptions & {}

/**
 * Standard output options types available to images
 */
export type GenerateImageOptions = GenerateBaseOptions & {
    /**
     * Output format of image
     */
    outputType?: 'tif' | 'tiff' | 'dzi' | 'iiif';
    /**
     * Required when outputType is 'iiif'. The address that will serve the resulting image service's info.json
     */
    id?: string;
    /**
     * Options passed directly to Sharp
     */
    sharpOptions?: any;
}

    // TODO support "orig" as thumbnailSize param, returns original image as buffer
export type ImageDimensions = {
    width:number,
    height:number,
    orientation?:number
};

export class ImageResource {

    /**
     * Original image: full resolution, preferably .tiff
     */
    id: URL | string;

    partOf: Art;

    /**
     * Image resource loaded as buffer into memory
     */
    buffer?: Buffer;

    dimensions: ImageDimensions;

    constructor(options: {
        id: URL | string;
        art: Art;
        buffer?: Buffer;
        dimensions?: ImageDimensions;
    }) {

        if (!options.id || !options.art) throw new Error('Image resource is missing a required property.');

        this.partOf = options.art;
        this.id = resolvePath(options.id);

        if (options.dimensions) this.dimensions = options.dimensions;

        if (options.buffer) this.buffer = options.buffer;
    }

    /**
     * Loads the image resource as a buffer
     */
    async loadResource(): Promise<Buffer> {

        if (this.buffer) return this.buffer;

        this.buffer = await getResourceBuffer(this.id);
        return this.buffer;
    }
    /**
     * Creates a new image resource for a thumbnail based on this image resource
     * @param thumbnailSize Size of thumbnail, in pixels
     * @param options 
     * @returns Buffer
     */
    async generateThumbnail(thumbnailSize: number, options?: GenerateThumbnailOptions): Promise<ImageResource> {
        if (!thumbnailSize) throw new Error('Thumbnail size is required.');

        const thisThumbnail = thumbnailSize;

        let origBuffer = await this.loadResource();

        // Create thumbnail and add to thumbnail object
        const thumbnailBuffer = await sharp(origBuffer)
                                        .resize({width:thumbnailSize})
                                        .withMetadata()
                                        .jpeg()
                                        .toBuffer();       

        log(`Created thumbnail for ${this.partOf.sourceName}.`);

        // save image
        let thumbnailId: string;

        const imageName = `${this.partOf.sourceName}-${thumbnailSize}px.jpeg`;
        if (options.saveFile) {
            thumbnailId = saveFile(imageName, thumbnailBuffer, {outputDir:options.outputDir, logLevel:options.logLevel});
        }
        else {
            thumbnailId = `${imageName}-buffer`;
        }

        const thumbnailResource = new ImageResource({
            id:thumbnailId,
            art:this.partOf,
            buffer: thumbnailBuffer
        });

        return thumbnailResource;
    }

    /**
     * Generates a new image based on this image resource, and returns it as a new image resource
     * @param options 
     */
    async generateImage(options: GenerateImageOptions): Promise<ImageResource> {
        if (!options.outputType) throw new Error('Output type is required for image generation.');

        const logLevel = options.logLevel ? options.logLevel : 'standard';
        setupLogging(logLevel, `${options.outputDir}/${this.partOf.sourceName}-generate`);

        let newImage: ImageResource;
        // Generate and save image
        switch (options.outputType) {
            case 'tif':
            case 'tiff':
                newImage = await this._tiffWithPyramids(options);
                break;
            case 'iiif':
                newImage = await this._iiif(options);
                break;
            case 'dzi':
                newImage = await this._dzi(options);
                break;
        }
        log(`Image transformed successfully. ${options.saveFile ? `File(s) saved to ${options.outputDir}.` : ''}`);
        return newImage;
    }

    async getDimensions(): Promise<ImageDimensions> {

        const imageBuffer = await this.loadResource();

        const dims = imageSize(imageBuffer);
        this.dimensions = {width:dims.width, height:dims.height, orientation:dims.orientation}
        return this.dimensions;
    }

    async _tiffWithPyramids(options: GenerateImageOptions): Promise<ImageResource> {

        const sharpOptions = options.sharpOptions ? options.sharpOptions : {};

        const imageBuffer = await this.loadResource();
        if (!this.dimensions) await this.getDimensions();

        const minimumTileWidth = this.dimensions.width > 256 ? 256 : this.dimensions.width - (this.dimensions.width % 16);
        const minimumTileHeight = this.dimensions.height > 256 ? 256 : this.dimensions.height - (this.dimensions.height % 16);
        
        const tiffBuffer = await sharp(imageBuffer, sharpOptions).tiff({
            pyramid:true,
            tile:true, // Not sure this flag matters since pyramid is true
            tileWidth: minimumTileWidth,
            tileHeight: minimumTileHeight,
        })
        .withMetadata({
            orientation:6
        })
        .toBuffer();
    
        let tiffId: string;

        const imageName = `${this.partOf.sourceName}.tiff`;
        if (options?.saveFile) {
            tiffId = saveFile(imageName,tiffBuffer,{outputDir:options.outputDir, logLevel:options.logLevel});
        }
        else {
            tiffId = `${imageName}-buffer`;
        }

        return new ImageResource({
            id: tiffId,
            art: this.partOf,
            buffer: tiffBuffer
        });
    }

    async _dzi(options: GenerateImageOptions): Promise<ImageResource> {
        if (!options.saveFile) throw new Error('Setting output to `dzi` requires files saved to disk. Set `saveFile: true.`')

        const sharpOptions = options.sharpOptions ? options.sharpOptions : {};
        const dirName = `${cleanTrailingSlash(options.outputDir)}/${this.partOf.sourceName}-dzi/`;

        if (existsSync(dirName)) rmSync(dirName, {recursive:true});
        mkdirSync(dirName);

        const imageBuffer = await this.loadResource();

        await sharp(imageBuffer, sharpOptions).tile({
            layout:'dz',
        }).toFile(dirName);

        return new ImageResource({
            id: dirName,
            art: this.partOf
        })
    }

    async _iiif(options: GenerateImageOptions): Promise<ImageResource> {
        if (!options.saveFile) throw new Error('Setting output to `iiif` requires files saved to disk. Set `saveFile: true.`')
        if (!options.id) throw new Error('`id` property is required when generating IIIF output.')

        const sharpOptions = options.sharpOptions ? options.sharpOptions : {};
        const dirName = `${cleanTrailingSlash(options.outputDir)}/${this.partOf.sourceName}-iiif/`;

        if (existsSync(dirName)) rmSync(dirName, {recursive:true});
        mkdirSync(dirName);

        const imageBuffer = await this.loadResource();

        await sharp(imageBuffer, sharpOptions).tile({
            layout:'iiif',
            id:cleanTrailingSlash(options.id)
        }).toFile(dirName);

        return new ImageResource({
            id: options.id, // This doesn't accurately reflect the directory
            art: this.partOf
        });
    }

    getId(): string {
        if (this.id instanceof URL) {
            return this.id.href;
        }
        else return this.id;
    }

    getMimeType(): string {

        const id = this.getId();

        const lastDotIndex = id.lastIndexOf('.');
        if (lastDotIndex === -1) throw new Error('ID is not a valid path to an image resource.');

        let ext = id.substring(lastDotIndex+1);

        if (ext === 'jpg') ext = 'jpeg';
        if (ext === 'tif') ext = 'tiff';

        return `image/${ext}`;
    }

    // TODO save any buffers in memory to disk, or upload to s3!
    // test ID and if it's not a valid ID then save buffer to disk
    async toIiifContentResource(options: GenerateIiifOptions): Promise<ContentResource> {

        setupLogging(options?.logLevel ? options.logLevel : 'standard', this.getId());

        if (!this.dimensions) await this.getDimensions();

        let resourceId = validatePath(this.id);
        if (resourceId) resourceId = resourceId as string;
        else {
            // ID is not valid, save buffer to disk
            if (this.getId().endsWith('-buffer') && this.buffer) {
                if (!options?.saveFile || !options?.outputDir) throw new Error(`Resource ${this.getId()} is only stored in memory. Please provide an output directory to save the buffer to disk.`);

                const outputId = this.getId().substring(0,(this.getId().length - '-buffer'.length));
                const newId = saveFile(outputId, this.buffer, {outputDir:options.outputDir, logLevel:options.logLevel});
                this.id = newId, resourceId = newId;
            }
            else throw new Error(`Resource ${this.getId()} has an invalid ID and is not saved in memory.`);
        }
        
        const iiifContentResource: ContentResource = {
            id: resourceId,
            type:"Image",
            format: this.getMimeType(),
            width: this.dimensions.width,
            height: this.dimensions.height,
            // language:'en' -- Images don't really have a default language
        }

        return iiifContentResource;
    }

    // static fromIiifContentResource(resource: ContentResource, parent: Art): ImageResource {

    //     const imageResource = new ImageResource({
    //         id:resource.id,
    //         art:parent,
    //         dimensions: {width:resource.width,height:resource.height}
    //     });
    //     return imageResource;
    // }
}