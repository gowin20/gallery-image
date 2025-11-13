import { getFileName } from "./Util.js";
import type { ImageId } from "./LayoutImage.js"
import { ImageResource, GenerateImageOptions } from "./ImageResource.js";

export type ArtistId = string;

export interface OldArtObject {
    /**
     * Database ID
     */
    id: string;
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
    id: string;
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
    id: string;
    /**
     * Original image: full resolution, preferably .tiff
     */
    source: URL | string | Buffer;
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

    id?: ArtId;

    source: ImageResource;
    sourceName: string;
    dimensions: {
        width: number;
        height: number;
    }

    thumbnails: {
        [_:`${number}`]: ImageResource;
    }

    metadata: ArtMetadata;

    constructor(options: ArtObject | OldArtObject) {

        this.thumbnails = {}
        if (options.thumbnails) {
            Object.keys(options.thumbnails).forEach(thumbnailId => {
                const size = thumbnailId.match(/\d+/)[0];

                this.thumbnails[size] = new ImageResource({
                    id: thumbnailId,
                    art: this
                });
            })
        }

        if (options.id) this.id = options.id;

        if ((options as OldArtObject).orig) {
            this.fromOldArtObject(options as OldArtObject);
            return;
        }

        const artObject = options as ArtObject;
        if (!artObject.source) throw new Error('No source specified for Art.');

        if (typeof artObject.source === 'string') {
            this.source = new ImageResource({
                id: artObject.source,
                art: this
            });
            this.sourceName = getFileName(artObject.source);
        }
        else if (artObject.source instanceof URL) {
            this.source = new ImageResource({
                id: artObject.source,
                art: this
            })
            this.sourceName = artObject.source.pathname;
        }
        else if (artObject.source instanceof Buffer) {
            if (!artObject.metadata.title) throw new Error('Passing a buffer requires an art title.')
            this.sourceName = artObject.metadata.title;
            this.source = new ImageResource({
                id: null,
                art: this,
                buffer: artObject.source
            })
        }

        this.metadata = artObject.metadata ? artObject.metadata : {};
    }

    fromOldArtObject(artObject: OldArtObject): this {
        if (!artObject.orig) throw new Error('Art requires an original image.');
        this.source = new ImageResource({id:artObject.orig, art:this});
        this.sourceName = getFileName(artObject.orig);

        this.metadata = {
            title: artObject.title ? artObject.title : null,
            creator: artObject.creator ? artObject.creator : null,
            details: artObject.details ? artObject.details : null,
            date: artObject.date ? artObject.date : null,
            location: artObject.location ? artObject.location : null
        };

        return this;
    }

    // toJson(): DbArtObject {
    //     //if (typeof this.source === 'object' || Object.keys(this.thumbnails).map(thumbnail => typeof this.thumbnails[thumbnail] === 'object')) throw new Error('Cannot convert to JSON: Object contains unsaved buffers');
    //     // TODO save all thumbnails and orig first!
    //     if (this.source instanceof Buffer) throw new Error('Cannot convert to JSON: Source is a buffer.');
    //     Object.keys(this.thumbnails).forEach(thumbnail => {
    //         if (this.thumbnails[thumbnail] instanceof Buffer) throw new Error(`Cannot convert to JSON: Thumbnail ${thumbnail} is a buffer.`);
    //     })
    //     return {
    //         id: this.id,
    //         source: this.source as string | URL,
    //         thumbnails: this.thumbnails as {[_:`${number}`]: string | URL},
    //         metadata: this.metadata
    //     }
    // }


    thumbnailExists(thumbnailSize: number): boolean {
        return Object.keys(this.thumbnails).includes(String(thumbnailSize));
    }

    async loadOrCreateThumbnail(thumbnailSize: number): Promise<Buffer> {
        if (!this.thumbnailExists(thumbnailSize)) {
            await this.createThumbnail(thumbnailSize, {
                saveFile: false
            });
        }
        return await this.loadThumbnail(thumbnailSize);
    }

    async loadThumbnail(thumbnailSize: number): Promise<Buffer> {
        if (!this.thumbnailExists(thumbnailSize)) throw new Error('Cannot load a thumbnail that doesn\'t exist');

        let thumbnail = this.thumbnails[thumbnailSize]

        return await thumbnail.loadResource();
    }

    async createThumbnail(thumbnailSize: number, options?: GenerateImageOptions): Promise<ImageResource> {
        if (!thumbnailSize) throw new Error('Thumbnail size is required.');
        if (this.thumbnailExists(thumbnailSize)) throw new Error(`Thumbnail of size ${thumbnailSize} already exists for ${this.sourceName}.`)
        if (!this.source) throw new Error('Must have a full-resolution original image to build thumbnails.');
        
        const thumbnailResource = await this.source.generateThumbnail(thumbnailSize,options);

        this.thumbnails[thumbnailSize] = thumbnailResource;

        return thumbnailResource;
    }

    async generateImage(options: GenerateImageOptions): Promise<ImageResource> {
        return await this.source.generateImage(options);
    }
}