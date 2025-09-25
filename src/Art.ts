import sharp from "sharp";
import type { ArtObject, ArtId, ArtistId, ImageId } from "./types.js";
import { cleanTrailingSlash, getFileName, getResourceBuffer } from "./Util.js";
import type { GenerateImageOptions } from "./types.js"
import { writeFileSync } from "fs";

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

interface GenerateThumbnailOptions extends GenerateImageOptions {
    dirPath?: string;
}

const thumbnailName = (number: number) => `s-${number}px`;

export class Art {

    _id?: ArtId;

    orig: string | URL | Buffer;
    origName: string;

    image: ImageId;

    thumbnails: {
        [_:`s-${number}px`]: string | URL | Buffer;
    }

    properties: ArtProperties;

    constructor(options: ArtOptions) {

        if (!options.orig) throw new Error('Art requires an original image.');
        this.orig = options.orig;
        this.origName = getFileName(options.orig);

        if (options.image) this.image = options.image;
        else if (options.tiles) this.image = options.tiles;

        
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
    async generateThumbnail(thumbnailSize: number, options?: GenerateThumbnailOptions) {
        if (this.thumbnailExists(thumbnailSize)) {
            throw new Error(`Thumbnail of size ${thumbnailSize} already exists for ${this.origName}.`)
            return;
        };
        if (!this.orig) throw new Error('Must have a full-resolution original image to build thumbnails.');

        console.log(`Creating thumbnail for ${this.origName}`);

        const thisThumbnail = thumbnailName(thumbnailSize);

        let origBuffer: Buffer;
        if (this.orig instanceof Buffer) origBuffer = this.orig;
        else origBuffer = await getResourceBuffer(this.orig as string | URL );

        // Create thumbnail and add to thumbnail object
        const thumbnailBuffer = await sharp(origBuffer).resize({width:thumbnailSize}).jpeg().toBuffer();
        this.thumbnails[thisThumbnail] = thumbnailBuffer;
        
        // save image
        if (options?.saveFile) {
            if (!options.dirPath) throw new Error('Must provide a directory path with `dirPath` to save file.');

            writeFileSync(`${cleanTrailingSlash(options.dirPath)}/${this.origName}-${thisThumbnail}.jpeg`, thumbnailBuffer);
            console.log(`Saved thumbnail ${thisThumbnail} to ${options.dirPath}.`);
        }

        return;
    }
}