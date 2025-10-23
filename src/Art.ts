import { getFileName, getResourceBuffer, saveImage } from "./Util.js";
import type { GenerateImageOptions, ImageId } from "./LayoutImage.js"
import sharp from "sharp";

export type ArtistId = string;

export interface OldArtObject {
    /**
     * Database ID
     */
    _id: string;
    /**
     * Full resolution image
     */
    orig: URL | string;
    /**
     * Zoomable image of art
     */
    tiles?: ImageId;
    /**
     * URLs to cached thumbnail versions of the art, in different sizes
     */
    thumbnails: {
        [_:`${number}`]: URL | string;
    };
    /**
     * Creator of the art
     */
    creator?: ArtistId | null;
    /**
     * Title of piece.
     */
    title?: string | null;
    /**
     * Details / statement related to piece.
     */
    details?: string | null;
    /**
     * Date of creation
     */
    date: string | Date | null;
    /**
     * Location where it was created
     */
    location?: string | null;
}

export interface DbArtObject {
    /**
     * Database ID
     */
    _id: string;
    /**
     * Original image: full resolution, preferably .tiff
     */
    source: URL | string;
    /**
     * Thumbnail versions of the image in various resolutions.
     */
    thumbnails: {
        [_:`${number}`]: URL | string;
    };
    /**
     * Image properties and metadata
     */
    metadata: ArtMetadata;
}

export interface ArtObject {
    /**
     * Database ID
     */
    _id: string;
    /**
     * Original image: full resolution, preferably .tiff
     */
    source: URL | string | Buffer;
    /**
     * Thumbnail versions of the image in various resolutions.
     */
    thumbnails: {
        [_:`${number}`]: URL | string | Buffer;
    };
    /**
     * Image properties and metadata
     */
    metadata: ArtMetadata;
}

export type ArtMetadata = {
    /**
     * Creator of the art
     */
    creator?: ArtistId | string;
    /**
     * Title of piece.
     */
    title?: string;
    /**
     * Details / statement related to piece.
     */
    details?: string;
    /**
     * Date of creation
     */
    date?: string | Date;
    /**
     * Location where it was created
     */
    location?: string;
}

export type ArtId = string;

const thumbnailName = (number: number) => number;

export class Art {

    _id?: ArtId;

    source: string | URL | Buffer;
    sourceName: string;
    dimensions: {
        width: number;
        height: number;
    }

    thumbnails: {
        [_:`${number}`]: string | URL | Buffer;
    }

    metadata: ArtMetadata;

    constructor(options: ArtObject | OldArtObject) {

        if ((options as OldArtObject).orig) {
            this.fromOldArtObject(options as OldArtObject);
            return;
        }
        const artObject = options as ArtObject;
        if (!artObject.source) throw new Error('No source specified for Art.');

        this.source = artObject.source;
        if (typeof artObject.source === 'string') this.sourceName = getFileName(artObject.source);
        else if (artObject.source instanceof URL) this.sourceName = artObject.source.pathname;
        // buffer source
        else {
            if (!artObject.metadata.title) throw new Error('Passing a buffer requires an art title.')
            this.sourceName = artObject.metadata.title;
        }

        this.metadata = artObject.metadata ? artObject.metadata : {};
        this.thumbnails = artObject.thumbnails ? artObject.thumbnails : {};
        if (artObject._id) this._id = artObject._id;
    }

    fromOldArtObject(artObject: OldArtObject): this {
        if (!artObject.orig) throw new Error('Art requires an original image.');
        this.source = artObject.orig;
        this.sourceName = getFileName(artObject.orig);

        // Ignore old tiles
        // if (artObject.tiles) this.image = artObject.tiles;
        
        if (artObject._id) this._id = artObject._id;

        // Pase old thumbnail names
        this.thumbnails = {};
        if (artObject.thumbnails) {

            Object.keys(artObject.thumbnails).forEach((thumbnailName: `${number}`) => {
                const thumbnailSize = thumbnailName.match(/\d+/)[0];
                
                this.thumbnails[thumbnailSize] = artObject.thumbnails[thumbnailName];
            })
        }

        this.metadata = {
            title: artObject.title ? artObject.title : null,
            creator: artObject.creator ? artObject.creator : null,
            details: artObject.details ? artObject.details : null,
            date: artObject.date ? artObject.date : null,
            location: artObject.location ? artObject.location : null
        };

        return this;
    }

    toJson(): DbArtObject {
        //if (typeof this.source === 'object' || Object.keys(this.thumbnails).map(thumbnail => typeof this.thumbnails[thumbnail] === 'object')) throw new Error('Cannot convert to JSON: Object contains unsaved buffers');
        // TODO save all thumbnails and orig first!
        if (this.source instanceof Buffer) throw new Error('Cannot convert to JSON: Source is a buffer.');
        Object.keys(this.thumbnails).forEach(thumbnail => {
            if (this.thumbnails[thumbnail] instanceof Buffer) throw new Error(`Cannot convert to JSON: Thumbnail ${thumbnail} is a buffer.`);
        })
        return {
            _id: this._id,
            source: this.source as string | URL,
            thumbnails: this.thumbnails as {[_:`${number}`]: string | URL},
            metadata: this.metadata
        }
    }

    thumbnailExists(thumbnailSize: number): boolean {
        return Object.keys(this.thumbnails).includes(String(thumbnailSize));
    }
    getThumbnail(thumbnailSize: number): string | URL | Buffer {
        if (this.thumbnailExists(thumbnailSize)) return this.thumbnails[thumbnailSize];
        else return null;
    }
    /*
    Returns thumbnail as a buffer
    */

    // TODO support "orig" as thumbnailSize param, returns original image as buffer
    async loadOrGenerateThumbnail(thumbnailSize: number): Promise<Buffer> {
        let thumbnail: Buffer;
        if (!this.thumbnailExists(thumbnailSize)) {
            thumbnail = await this.generateThumbnail(thumbnailSize, {
                saveFile: false
            });
        }
        else {
            thumbnail = await this.loadThumbnail(thumbnailSize);
        }
        return thumbnail;
    }

    async loadThumbnail(thumbnailSize: number): Promise<Buffer> {

        if (!this.thumbnailExists(thumbnailSize)) throw new Error('Cannot load a thumbnail that doesn\'t exist');

        let thumbnail = this.thumbnails[thumbnailSize]

        if (thumbnail instanceof Buffer) return thumbnail;
        else {
           const loadedThumbnail = await getResourceBuffer(thumbnail);
           this.thumbnails[thumbnailSize] = loadedThumbnail;

           return loadedThumbnail;
        }
    }
    async generateThumbnail(thumbnailSize: number, options?: GenerateImageOptions): Promise<Buffer> {
        if (!thumbnailSize) throw new Error('Thumbnail size is required.');
        const logLevel = options.logLevel ? options.logLevel : {};

        if (this.thumbnailExists(thumbnailSize)) {
            throw new Error(`Thumbnail of size ${thumbnailSize} already exists for ${this.sourceName}.`)
            return;
        };
        if (!this.source) throw new Error('Must have a full-resolution original image to build thumbnails.');

        const thisThumbnail = thumbnailSize;

        let origBuffer: Buffer;
        if (this.source instanceof Buffer) origBuffer = this.source;
        else origBuffer = await getResourceBuffer(this.source as string);

        // Create thumbnail and add to thumbnail object
        const thumbnailBuffer = await sharp(origBuffer)
                                        .resize({width:thumbnailSize})
                                        .withMetadata()
                                        .jpeg()
                                        .toBuffer();
        this.thumbnails[thumbnailSize] = thumbnailBuffer;
        

        if (logLevel !== 'none') console.log(`Created thumbnail for ${this.sourceName}.`);
        // save image
        if (options?.saveFile) {
            saveImage(options.outputDir,`${this.sourceName}-${thumbnailSize}px.jpeg`, thumbnailBuffer);
            if (logLevel !== 'none') console.log(`Saved thumbnail ${thisThumbnail} to ${options.outputDir}.`);
        }        
        return thumbnailBuffer;
    }

    async createSourcePyramid(options: GenerateImageOptions): Promise<Buffer> {
        if (this.source instanceof Buffer) throw new Error('Source is already loaded as a TIFF buffer.');
        const logLevel = options.logLevel ? options.logLevel : {};
        
        const origBuffer = await getResourceBuffer(this.source as string);

        const pyramidBuffer = await sharp(origBuffer).tiff({
            pyramid: true,
            tile: true
        }).toBuffer();
        this.source = pyramidBuffer;

        if (options?.saveFile) {
            saveImage(options.outputDir,`${this.sourceName}.tiff`, pyramidBuffer);
            if (logLevel !== 'none') console.log('Wrote pyramid TIFF to temp directory.');
        }

        return pyramidBuffer;
    }
}