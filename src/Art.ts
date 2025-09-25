import sharp from "sharp";
import type { ArtObject, ArtMetadata, ArtId, ImageId, OldArtObject } from "./types.js";
import { getFileName, getResourceBuffer, saveImage } from "./Util.js";
import type { GenerateImageOptions } from "./types.js"
import { imageSize } from "image-size";

type ArtOptions = ArtObject | OldArtObject;

const thumbnailName = (number: number) => `s-${number}px`;

export class Art {

    _id?: ArtId;

    source: string | URL | Buffer;
    sourceName: string;

    image: ImageId | Buffer;
    dimensions: {
        width: number;
        height: number;
    }

    thumbnails: {
        [_:`s-${number}px`]: string | URL | Buffer;
    }

    metadata: ArtMetadata;

    constructor(options: ArtOptions) {

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

        this.thumbnails = artObject.thumbnails ? artObject.thumbnails : {};

        this.metadata = {
            title: artObject.title ? artObject.title : null,
            creator: artObject.creator ? artObject.creator : null,
            details: artObject.details ? artObject.details : null,
            date: artObject.date ? artObject.date : null,
            location: artObject.location ? artObject.location : null
        };

        return this;
    }

    toJson(): ArtObject {
        if (typeof this.source === 'object' || typeof this.image === 'object' || Object.keys(this.thumbnails).map(thumbnail => typeof this.thumbnails[thumbnail] === 'object')) throw new Error('Cannot convert to JSON: Object contains unsaved buffers');
        // TODO save all thumbnails and orig first!
        
        return {
            _id: this._id,
            source: this.source,
            image: this.image,
            thumbnails: this.thumbnails as {[_:`s-${number}px`]: string | URL},
            metadata: this.metadata
        }
    }

    thumbnailExists(thumbnailSize: number): boolean {
        return Object.keys(this.thumbnails).includes(thumbnailName(thumbnailSize));
    }
    getThumbnail(thumbnailSize: number): string | URL | Buffer {
        if (this.thumbnailExists(thumbnailSize)) return this.thumbnails[thumbnailName(thumbnailSize)];
        else return null;
    }
    /*
    Returns thumbnail as a buffer
    */
    async loadThumbnail(thumbnailSize: number): Promise<Buffer> {

        if (!this.thumbnailExists(thumbnailSize)) throw new Error('Cannot load a thumbnail that doesn\'t exist');

        let thumbnail = this.thumbnails[thumbnailName(thumbnailSize)]

        if (thumbnail instanceof Buffer) return thumbnail;
        else {
           const loadedThumbnail = await getResourceBuffer(thumbnail);
           this.thumbnails[thumbnailName(thumbnailSize)] = loadedThumbnail;

           return loadedThumbnail;
        }
    }
    async generateThumbnail(thumbnailSize: number, options?: GenerateImageOptions): Promise<Buffer> {
        if (this.thumbnailExists(thumbnailSize)) {
            throw new Error(`Thumbnail of size ${thumbnailSize} already exists for ${this.sourceName}.`)
            return;
        };
        if (!this.source) throw new Error('Must have a full-resolution original image to build thumbnails.');

        const thisThumbnail = thumbnailName(thumbnailSize);

        let origBuffer: Buffer;
        if (this.source instanceof Buffer) origBuffer = this.source;
        else origBuffer = await getResourceBuffer(this.source as string | URL );

        // Create thumbnail and add to thumbnail object
        const thumbnailBuffer = await sharp(origBuffer).resize({width:thumbnailSize}).jpeg().toBuffer();
        this.thumbnails[thisThumbnail] = thumbnailBuffer;
        

        console.log(`Created thumbnail for ${this.sourceName}.`);
        // save image
        if (options?.saveFile) {
            saveImage(options.outputDir,`${this.sourceName}-${thisThumbnail}.jpeg`, thumbnailBuffer);
            console.log(`Saved thumbnail ${thisThumbnail} to ${options.outputDir}.`);
        }        
        return thumbnailBuffer;
    }

    pyramidExists(): boolean {
        return this.image !== undefined;
    }
    async generatePyramid(options: GenerateImageOptions): Promise<Buffer> {
        if (this.image) throw new Error('Image pyramid already exists.');

        const origBuffer = await getResourceBuffer(this.source as string | URL);

        const dimensions = imageSize(origBuffer);
        console.log('Image dimensions result:')
        console.log(dimensions)

        this.dimensions = {
            height: dimensions.height,
            width: dimensions.width
        }

        const pyramidBuffer = await sharp(origBuffer).tiff({
            pyramid: true,
            tile: true
        }).toBuffer();
        this.image = pyramidBuffer;

        if (options?.saveFile) {
            saveImage(options.outputDir,`${this.sourceName}-image.tiff`, pyramidBuffer);
            console.log('Wrote pyramid TIFF to temp directory.');
        }

        return pyramidBuffer;
    }
}