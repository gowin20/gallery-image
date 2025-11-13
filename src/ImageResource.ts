import { getResourceBuffer, cleanTrailingSlash } from "./Util.js";
import { Art } from "./gallery-image.js";
import sharp from "sharp";
import { writeFileSync } from "fs";

/**
 * Base options for generating all kinds of images
 */
export type GenerateImageBaseOptions = {
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
    /**
     * 
     */
    sharpOptions?: any;
}

export type GenerateImageOptions = GenerateImageBaseOptions & {
        /**
     * Output format of image
     */
    outputType?: 'tif' | 'tiff' | 'dzi' | 'iiif';
    /**
     * Required when outputType is 'iiif'. The address that will serve the resulting image service's info.json
     */
    id?: string;
}

    // TODO support "orig" as thumbnailSize param, returns original image as buffer


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

    service?: any;

    constructor(options: {
        id: URL | string;
        art: Art;
        buffer?: Buffer;
    }) {

        if (!options.id || !options.art) throw new Error('Image resource is missing a required property.');

        this.partOf = options.art;
        this.id = options.id;

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
    async generateThumbnail(thumbnailSize: number, options?: GenerateImageBaseOptions): Promise<ImageResource> {
        if (!thumbnailSize) throw new Error('Thumbnail size is required.');

        const logLevel = options.logLevel ? options.logLevel : {};

        const thisThumbnail = thumbnailSize;

        let origBuffer = await this.loadResource();

        // Create thumbnail and add to thumbnail object
        const thumbnailBuffer = await sharp(origBuffer)
                                        .resize({width:thumbnailSize})
                                        .withMetadata()
                                        .jpeg()
                                        .toBuffer();       

        if (logLevel !== 'none') console.log(`Created thumbnail for ${this.partOf.sourceName}.`);

        // save image
        let thumbnailId: string;
        const imageName = `${this.partOf.sourceName}-${thumbnailSize}px.jpeg`;

        if (options.saveFile) {
            const path = `${cleanTrailingSlash(options.outputDir)}/${imageName}`;
            thumbnailId = path;

            writeFileSync(path, thumbnailBuffer);
            if (logLevel !== 'none') console.log(`Saved thumbnail ${thisThumbnail} to ${options.outputDir}.`);
        }
        else {
            thumbnailId = imageName;
        }

        const thumbnailResource = new ImageResource({
            id:thumbnailId,
            art:this.partOf,
            buffer: thumbnailBuffer
        });

        return thumbnailResource;
    }

    async createSourcePyramid(options: GenerateImageOptions): Promise<ImageResource> {
        const logLevel = options.logLevel ? options.logLevel : {};
        
        const origBuffer = await this.loadResource();

        const pyramidBuffer = await sharp(origBuffer).tiff({
            pyramid: true,
            tile: true
        }).toBuffer();


        let tiffId: string;

        if (options?.saveFile) {
            const path = `${cleanTrailingSlash(options.outputDir)}/${this.partOf.sourceName}.tiff`;
            tiffId = path;
            writeFileSync(path, pyramidBuffer);
            if (logLevel !== 'none') console.log('Wrote pyramid TIFF to temp directory.');
        }
        else {
            tiffId = `${this.partOf.sourceName}.tiff`;
        }

        return new ImageResource({
            id: tiffId,
            art: this.partOf,
            buffer: pyramidBuffer
        });
    }
}