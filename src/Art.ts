import sharp from "sharp";
import type { ArtObject, ArtId, ArtistId, ImageId } from "./types.js";
import { getResourceBuffer } from "./Util.js";
import { GenerateImageOptions } from "./image/LayoutImage.js";

export type ArtProperties = {
    /**
     * Creator of the art
     */
    creator?: ArtistId;
    /**
     * Title of piece.
     */
    title?: string;
    /**
     * Details / statement related to piece.
     */
    details?: string;
    /**
     * Location where it was created
     */
    location?: string;
    /**
     * Date of creation
     */
    date?: string | Date;
}

interface ArtOptions extends ArtObject {
    image?: ImageId;
}

const thumbnailName = (number: number) => `s-${number}px`;

export class Art {

    _id?: string;

    orig: string | URL | Buffer;

    image: ImageId;

    thumbnails: {
        [_:`s-${number}px`]: string | URL | Buffer;
    }

    properties: ArtProperties;

    constructor(options: ArtOptions) {

        if (!(options.orig || options.image || options.tiles)) throw new Error('Art requires an image.');

        if (options.image) this.image = options.image;
        else if (options.tiles) this.image = options.tiles;

        if (options.orig) this.orig = options.orig;
        if (options._id) this._id = options._id;

        this.thumbnails = options.thumbnails ? options.thumbnails : {};

        this.properties = {
            title: options.title ? options.title : null,
            creator: options.creator ? options.creator : null,
            details: options.details ? options.details : null,
            date: options.date ? options.date : null,
            location: options.location ? options.location : null
        };

    }

    toJson(): ArtObject {
        if (typeof this.orig === 'object' || Object.keys(this.thumbnails).map(thumbnail => typeof this.thumbnails[thumbnail] === 'object')) throw new Error('Cannot convert to JSON: Object contains unsaved buffers');
        return {
            _id: this._id,
            orig: this.orig,
            tiles: this.image,
            thumbnails: this.thumbnails as {[_:`s-${number}px`]: string | URL},
            creator: this.properties.creator,
            title: this.properties.title,
            details: this.properties.details,
            date: this.properties.date,
            location: this.properties.location
        }
    }

    thumbnailExists(thumbnailSize: number): boolean {
        return Object.keys(this.thumbnails).includes(thumbnailName(thumbnailSize));
    }
    getThumbnails(thumbnailSize: number): {[_:`s-${number}px`]:string} {
        if (this.thumbnailExists(thumbnailSize)) return this.thumbnails[thumbnailName(thumbnailSize)];
        else return null;
    }
    async generateThumbnail(thumbnailSize: number, options: GenerateImageOptions) {
        if (this.thumbnailExists(thumbnailSize)) {
            throw new Error(`Thumbnail of size ${thumbnailSize} already exists for ${this._id}.`)
            return;
        };
        if (!this.orig) throw new Error('Must have a full-resolution original image to build thumbnails.');

        console.log(`Creating thumbnail for ${this._id}`);

        const thisThumbnail = thumbnailName(thumbnailSize);

        let origBuffer: Buffer;
        if (this.orig instanceof Buffer) origBuffer = this.orig;
        else origBuffer = await getResourceBuffer(this.orig as string | URL );
        
        const thumbnailBuffer = await sharp(origBuffer).resize({width:thumbnailSize}).jpeg().toBuffer();

        // save image
        if (options.filePath) {

        }

        return;
    }
}