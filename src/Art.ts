import sharp from "sharp";
import type { ArtObject, ArtId, ArtistId, ImageId } from "./types.js";
import { cleanTrailingSlash, getFileName, getResourceBuffer } from "./Util.js";
import type { GenerateImageOptions } from "./types.js"
import { writeFileSync } from "fs";
import { imageSize } from "image-size";

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

    _id?: ArtId;

    orig: string | URL | Buffer;
    origName: string;

    image: ImageId | Buffer;
    dimensions: {
        width: number;
        height: number;
    }

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
        if (typeof this.orig === 'object' || typeof this.image === 'object' || Object.keys(this.thumbnails).map(thumbnail => typeof this.thumbnails[thumbnail] === 'object')) throw new Error('Cannot convert to JSON: Object contains unsaved buffers');
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
            throw new Error(`Thumbnail of size ${thumbnailSize} already exists for ${this.origName}.`)
            return;
        };
        if (!this.orig) throw new Error('Must have a full-resolution original image to build thumbnails.');

        const thisThumbnail = thumbnailName(thumbnailSize);

        let origBuffer: Buffer;
        if (this.orig instanceof Buffer) origBuffer = this.orig;
        else origBuffer = await getResourceBuffer(this.orig as string | URL );

        // Create thumbnail and add to thumbnail object
        const thumbnailBuffer = await sharp(origBuffer).resize({width:thumbnailSize}).jpeg().toBuffer();
        this.thumbnails[thisThumbnail] = thumbnailBuffer;
        

        console.log(`Created thumbnail for ${this.origName}.`);
        // save image
        if (options?.saveFile) {
            if (!options.outputDir) throw new Error('Must provide a directory path with `outputDir` to save file.');

            writeFileSync(`${cleanTrailingSlash(options.outputDir)}/${this.origName}-${thisThumbnail}.jpeg`, thumbnailBuffer);
            console.log(`Saved thumbnail ${thisThumbnail} to ${options.outputDir}.`);
        }        
        return thumbnailBuffer;
    }

    pyramidExists(): boolean {
        return this.image !== undefined;
    }
    async generatePyramid(options: GenerateImageOptions): Promise<Buffer> {
        if (this.image) throw new Error('Image pyramid already exists.');

        const origBuffer = await getResourceBuffer(this.orig as string | URL);

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

            writeFileSync(`${cleanTrailingSlash(options.outputDir)}/${this.origName}-tiled.tiff`, pyramidBuffer);
            console.log('Wrote pyramid TIFF to temp directory.');
        }

        return pyramidBuffer;
    }
}