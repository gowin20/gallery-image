import { getFileName, getJsonResource, saveFile, setupLogging } from "./Util.js";
import type { ImageId } from "./LayoutImage.js"
import { ImageResource }  from "./ImageResource.js";
import type { GenerateImageOptions, GenerateThumbnailOptions, ImageDimensions, GenerateBaseOptions } from "./ImageResource.js";
import type { Canvas, ContentResource, Manifest, MetadataItem } from '@iiif/presentation-3';

export type ArtistId = string;

type Thumbnails = {[_:`${number}`]: URL | string};

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
    thumbnails: Thumbnails;
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
    thumbnails: Thumbnails;
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
    source: URL | string | Buffer | ImageResource;
    /**
     * Thumbnail versions of the image in various resolutions.
     */
    thumbnails: Thumbnails;
    /**
     * Image properties and metadata
     */
    metadata: Metadata;

    dimensions?: ImageDimensions;
}

export type Metadata = {
    label: { [_:string]: string[] },
    value: { [_:string]: string[] }
}[] | { [_:string]:string } | any

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

export type GenerateIiifOptions = GenerateBaseOptions & {
   exclude: string[];
}

const fromIiifThumbnail = (thumbnail): Thumbnails => {
    const thumbnails = {};
    for (const thumbnailItem of thumbnail) {
        thumbnails[thumbnailItem.width] = thumbnailItem.id
    }
    return thumbnails
}

function artOptionsFromIiif(iiif:Canvas, options?: {exclude: string[]}) {
    const artOptions: ArtObject = {
        id: iiif.id,
        // @ts-ignore
        source: iiif.items[0].items[0].body.id as string, 
        thumbnails: iiif.thumbnail ? fromIiifThumbnail(iiif.thumbnail) : null,
        metadata: iiif.metadata ? iiif.metadata : null
    };

    if (iiif.width && iiif.height) {
        artOptions.dimensions = {width:Number(iiif.width), height:Number(iiif.height)};
    }

    return artOptions;
}

export class Art {

    id?: ArtId;

    source: ImageResource;
    sourceName: string;
    dimensions: ImageDimensions;

    thumbnails: {
        [_:`${number}`]: ImageResource;
    }

    metadata: Metadata;

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
            if (artObject.dimensions) {
                const castDimensions= (dimensions:ImageDimensions) =>{return {width:Number(dimensions.width), height:Number(dimensions.height), orientation:Number(dimensions.orientation)}};
                this.dimensions = castDimensions(artObject.dimensions);
                this.source.dimensions = castDimensions(artObject.dimensions);
            };
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
        else if (artObject.source instanceof ImageResource) {
            this.source = artObject.source;
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
    addThumbnail(thumbnailSize: number, path: string | URL): ImageResource {
        this.thumbnails[thumbnailSize] = new ImageResource({
            id: path,
            art: this
        });
        return this.thumbnails[thumbnailSize];
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

    async toIiifThumbnail(options: GenerateIiifOptions): Promise<ContentResource[]> {
        if (options?.exclude && options.exclude.includes('thumbnails')) return;

        const thumbnail: ContentResource[] = [];
        const thumbnails = Object.keys(this.thumbnails).sort((a,b) => Number(b)-Number(a))
        for (const thumbnailSize of thumbnails) {
            const thumbnailContentResource = await this.thumbnails[thumbnailSize].toIiifContentResource(options);
            thumbnail.push(thumbnailContentResource)
        }

        return thumbnail;
    }
    toIiifMetadata(options: GenerateIiifOptions): MetadataItem[] {
        if (options?.exclude && options.exclude.includes('metadata')) return;

        const metadata: MetadataItem[] = [];
        for (const metadataLabel of Object.keys(this.metadata)) {
            metadata.push({
                "label": {"en":[metadataLabel.charAt(0).toUpperCase()+metadataLabel.slice(1)]},
                "value": {"en":[this.metadata[metadataLabel]]}
            });
        }
        return metadata;
    }

    async toIiifCanvas(canvasId: string, options: GenerateIiifOptions): Promise<Canvas> {
        if (!canvasId) throw new Error('Must provide a canvas ID for IIIF output.');
        setupLogging(options?.logLevel ? options.logLevel : 'standard', canvasId);

        this.dimensions = await this.source.getDimensions();

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
                            body: await this.source.toIiifContentResource(options),
                            target: canvasId
                        }
                    ]
                }
            ]
        }
        
        if (this.thumbnails) {
            iiifCanvas.thumbnail = await this.toIiifThumbnail(options);
        }
        if (this.metadata) {
            iiifCanvas.metadata = this.toIiifMetadata(options);
        }
        if (options?.saveFile) {
            saveFile(`${this.sourceName}-canvas.json`,JSON.stringify(iiifCanvas,null,2),options)
        }
        return iiifCanvas;
    }

    async toIiifManifest(manifestId: string, options: GenerateIiifOptions): Promise<Manifest> {
        if (!manifestId) {
            if (this.id) manifestId = this.id;
            else throw new Error('Must provide a manifest ID for IIIF output.');
        }
        setupLogging(options?.logLevel ? options.logLevel : 'standard', manifestId);
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
            ],
            // viewingDirection: '',
            // behavior: 'continuous' // TODO investigate more
        }
        // TODO presentation information, rights information, links, list of services within, structure of resource with Range, commentary annotations on the Manifest
        
        if (this.thumbnails) {
            iiifManifest.thumbnail = await this.toIiifThumbnail(options);
        }
        if (this.metadata) {
            iiifManifest.metadata = this.toIiifMetadata(options);
        }
        if (options?.saveFile) {
            saveFile(`${this.sourceName}-manifest.json`,JSON.stringify(iiifManifest,null,2),options)
        }
        return iiifManifest;
    }

    static async fromOldArtObject(options) {
        // TODO
    }
    static async fromArtObject(options) {

    }
    // TODO add types and support all iiif
    static fromIiifCanvas(canvas: Canvas) {
        
        const artOptions = artOptionsFromIiif(canvas);
        return new Art(artOptions)
    }
    static fromIiifManifest(manifest: Manifest) {
        const artOptions = artOptionsFromIiif(manifest.items[0]);
        artOptions.id = manifest.id;

        if (manifest.thumbnail) artOptions.thumbnails = fromIiifThumbnail(manifest.thumbnail);
        if (manifest.metadata) artOptions.metadata = manifest.metadata;

        // @ts-ignore
        if (manifest.width && manifest.height) {
            // @ts-ignore
            artOptions.dimensions = {width:Number(manifest.width), height:Number(manifest.height)};
        }
        return new Art(artOptions);
    }

    static async fromIiif(iiif: any, type: 'Canvas' | 'Manifest'): Promise<Art> {

        const iiifJson = await getJsonResource(iiif) as Canvas | Manifest | any;
        console.log('Parsed json:')
        console.log(iiifJson)
        if (iiifJson.type !== 'Canvas' && iiifJson.type !== 'Manifest') throw new Error(`Art can only be created from a Canvas or Manifest, not a ${iiifJson.type}.`);
        
        if (type === 'Canvas') {
            return Art.fromIiifCanvas(iiifJson);
        }
        else if (type === 'Manifest') {
            return Art.fromIiifManifest(iiifJson);
        }
        else throw new Error('Invalid type passed.')
    }
}

