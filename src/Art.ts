import { getFileName, saveFile } from "./Util.js";
import type { ImageId } from "./LayoutImage.js"
import { ImageResource }  from "./ImageResource.js";
import type { GenerateImageOptions, GenerateThumbnailOptions, GenerateIiifOptions, ImageDimensions, GenerateBaseOptions } from "./ImageResource.js";
import type { Canvas, Manifest } from '@iiif/presentation-3';

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

type ArtOptions = {
    objectType: 'ArtObject' | 'OldArtObject' | 'DbArtObject' | 'iiif'
}

type GenerateIiifOptions = GenerateBaseOptions & {
   exclude: string[];
}

export class Art {

    id?: ArtId;

    source: ImageResource;
    sourceName: string;
    dimensions: ImageDimensions;

    thumbnails: {
        [_:`${number}`]: ImageResource;
    }

    metadata: ArtMetadata;

    constructor(options: ArtObject | OldArtObject) {

        this.thumbnails = {}
        if (options.thumbnails) {
            Object.keys(options.thumbnails).forEach(thumbnailSize => {
                const size = thumbnailSize.match(/\d+/)[0];
                
                this.thumbnails[size] = new ImageResource({
                    id: options.thumbnails[thumbnailSize],
                    art: this
                });
            })
        }    

        if ((options as OldArtObject).orig) {
            this.fromOldArtObject(options as OldArtObject);
        }
        else {
            const artObject = options as ArtObject;
            this.setArtSource(artObject);
            this.metadata = artObject.metadata ? artObject.metadata : {};
            if (options.id) this.id = options.id;
        }
    }

    setArtSource(artObject: ArtObject): void {
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

    async createThumbnail(thumbnailSize: number, options?: GenerateThumbnailOptions): Promise<ImageResource> {
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

    toArtObject(): ArtObject {

        const jsonThumbnails = {}
        Object.keys(this.thumbnails).forEach(size => {
            jsonThumbnails[size] = this.thumbnails[size].id
        })
        return {
            id: this.id,
            source: this.source.id,
            thumbnails:jsonThumbnails,
            metadata:this.metadata
        }
    }

    async toIiifCanvas(id: string, options: GenerateIiifOptions): Promise<Canvas> {

        this.dimensions = await this.source.getDimensions();

        const canvasId = id ? id : this.id;

        const iiifCanvas: Canvas = {
            id: canvasId,
            type:"Canvas",
            height:this.dimensions.height,
            width:this.dimensions.width,
            items: [
                {
                    id: `${canvasId}/annotationpage/0`,
                    type:"AnnotationPage",
                    items: [
                        {
                            id: `${canvasId}/annotation/0`,
                            type:"Annotation",
                            motivation:"Painting",
                            body: await this.source.toIiifContentResource()
                        }
                    ]
                }
            ]
        }
        
        if (this.thumbnails && !options.exclude.includes('thumbnails')) {
            iiifCanvas.thumbnail = [];
            for (const thumbnailSize of Object.keys(this.thumbnails)) {
                const thumbnailContentResource = await this.thumbnails[thumbnailSize].toIiifContentResource();
                iiifCanvas.thumbnail.push(thumbnailContentResource)
            }
        }

        if (this.metadata && !options.exclude.includes('metadata')) {
            iiifCanvas.metadata = [];
            for (const metadataLabel of Object.keys(this.metadata)) {
                iiifCanvas.metadata.push({
                    "label": {"en":[metadataLabel.charAt(0).toUpperCase()+metadataLabel.slice(1)]},
                    "value": {"en":[this.metadata[metadataLabel]]}
                })
            }
        }

        if (options.saveFile) {
            saveFile(this.sourceName,JSON.stringify(iiifCanvas,null,2),options)
        }
        return iiifCanvas;
    }

    async toIiifManifest(manifestId: string, options: GenerateIiifOptions): Promise<Manifest> {
        // Creates a manifest with just a single canvas inside

        const iiifCanvas = await this.toIiifCanvas(`${manifestId}/canvas`, {
            exclude: ['thumbnails', 'metadata'],
            saveFile: false
        })

        const iiifManifest: Manifest = {
            "@context": "http://iiif.io/api/presentation/3/context.json",
            id: manifestId,
            type: 'Manifest',
            label: {
                "en": [this.sourceName]
            },
            items: [
                iiifCanvas
            ]
        }
        // TODO presentation information, rights information, links, list of services within, structure of resource with Range, commentary annotations on the Manifest
                
        if (this.thumbnails && !options.exclude.includes('thumbnails')) {
            iiifManifest.thumbnail = [];
            for (const thumbnailSize of Object.keys(this.thumbnails)) {
                const thumbnailContentResource = await this.thumbnails[thumbnailSize].toIiifContentResource();
                iiifManifest.thumbnail.push(thumbnailContentResource)
            }
        }

        if (this.metadata && !options.exclude.includes('metadata')) {
            iiifManifest.metadata = [];
            for (const metadataLabel of Object.keys(this.metadata)) {
                iiifManifest.metadata.push({
                    "label": {"en":[metadataLabel.charAt(0).toUpperCase()+metadataLabel.slice(1)]},
                    "value": {"en":[this.metadata[metadataLabel]]}
                })
            }
        }

        if (options.saveFile) {
            saveFile(this.sourceName,JSON.stringify(iiifManifest,null,2),options)
        }

        return iiifManifest;
    }

    static async fromOldArtObject(options) {
        // TODO
    }
    static async fromArtObject(options) {

    }
    static async fromIiif(options) {
        // accepts Canvas, Manifest, Content resource
    }
}