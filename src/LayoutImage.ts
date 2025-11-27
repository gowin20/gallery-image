import sharp from "sharp";
import { setupLogging, log, error } from "./Util.js";
import { imageSize } from 'image-size';
import { GenerateImageOptions, GenerateThumbnailOptions, ImageResource } from "./ImageResource.js";
import { Art, ArtObject } from "./Art.js";
import { Layout } from "./Layout.js";

type ArtBlock = {
    input: Buffer;
    top: number;
    left: number;
}

export type ImageId = string;

export interface ImageObject {
    _id: string;
    type?: "stitch" | "dzi";
    Image: DziImage | StitchedImage;
}

export type DziImage = {
    Url: string;
    xmlns: string;
    Format: "jpeg";
    Overlap: number;
    TileSize: number;
    Size: {
        Width: number;
        Height: number;
    }
}

export type StitchedImage = {
    Path: string;
}

export type GenerateLayoutImageOptions = GenerateImageOptions & {
    saveThumbnails?: boolean;
        /**
     * Whether to overwrite the existing image on file
     */
    overwrite?: boolean;
}

export class LayoutImage extends Art {
    
    layout: Layout;
    name: string;

    constructor(layout: Layout) {

        if (!layout) throw new Error('Image requires a layout');
        const artOptions: ArtObject = {
            id:`${layout.id}-image`,
            source:null,
            thumbnails: {},
            metadata: {
                title: layout.name
            },
        }

        super(artOptions);
        this.layout = layout;
    };

    setArtSource(artObject: ArtObject): void {
        if (!artObject.source) {
            this.sourceName = artObject.id;
        }
        else {
            super.setArtSource(artObject);
        }
    }

    async createLayoutImage (options: GenerateLayoutImageOptions): Promise<this> {
        
        console.log('ALL OPTIONS:')
        console.log(options);
        // Axiom: All input images are the same resolution
        const thumbnailSize = this.layout.thumbnailSize;

        const sampleArt = this.layout.array[0][0];

        const sampleBuffer = await sampleArt.loadOrCreateThumbnail(thumbnailSize,{saveFile:false});
        const dimensions = imageSize(sampleBuffer);
        this.dimensions = {
            width: dimensions.width,
            height: dimensions.height,
            orientation: dimensions.orientation
        };

        const imageWidth = dimensions.width, imageHeight = dimensions.height;

        log('Beginning stitched image generation...');

        let totalCount = 0, totalDone = 0;
        for (const row of this.layout.array) for (const item of row) totalCount++;

        const blocks: ArtBlock[] = [];

        let y=0;

        const thumbnailOptions: GenerateThumbnailOptions = {
            saveFile: options?.saveThumbnails ? options.saveThumbnails : false,
            outputDir: options.outputDir
        }
        for (const row of this.layout.array) {
            let x = 0;
            for (const art of row) {
                // Every 10 times this runs is approx. 45s
                try {
                    const artBuffer = await art.loadOrCreateThumbnail(thumbnailSize, thumbnailOptions);

                    const artBlock: ArtBlock = {
                        input: artBuffer,
                        top:y*imageHeight,
                        left:x*imageWidth
                    }

                    blocks.push(artBlock);
                    log(`[${totalDone+1}/${totalCount}] ${art.sourceName} fetched...`);
                }
                catch (e) {
                    error(e);
                }
                totalDone++;
                x++;
            }
            y++;
        }

        // Wait until all images are processed
        await new Promise((resolve) => {
            const intervalId = setInterval(() => {
                if (totalDone === totalCount) {
                    clearInterval(intervalId);
                    resolve(totalDone);
                };
            }, 100);
        });
        log(`Loaded ${totalDone} images. Stitching...`);

        const params = {
            create: {
                width:imageWidth * this.layout.numCols,
                height:imageHeight * this.layout.numRows,
                channels: 4,
                background: { r: 48, g: 48, b: 48, alpha: 1 } // #303030 - same as site background
            }
        }
        if (options.sharpOptions) Object.assign(params, options.sharpOptions)

        // Generate large blank image in temp folder
        // @ts-ignore
        const buffer = await sharp(params).composite(blocks).tiff({
            quality:100
        }).toBuffer();
        log('Layout fully assembled and saved as buffer.');


        this.source = new ImageResource({
            id:this.sourceName,
            art:this,
            buffer:buffer,            
        });
        return this;
    }

    async generateImage(options: GenerateLayoutImageOptions): Promise<ImageResource> {
        // Debug logging
        const logLevel = options.logLevel ? options.logLevel : 'standard';
        setupLogging(logLevel,`${options.outputDir}/${this.layout.id}-generate`);

        if (!this.source) {
            log('Layout image needs to be assembled. Starting assembly process...');
            const sharpOptions = options.sharpOptions ? options.sharpOptions : {};
            await this.createLayoutImage(options);
        }

        const finalImage = await this.source.generateImage(options);
        this.source = finalImage;
        log(`Generation complete. File(s) saved to ${options.outputDir}.`);
        return this.source;
    };
}