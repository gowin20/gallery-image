import { Art, Layout } from "../gallery-image.js";
import { LayoutImage } from "./LayoutImage.js";
import type { ArtId, GenerateImageOptions } from "../types.js";
import sharp from "sharp";

// TODO REMOVE THIS
import allNotes from '../../data/all-notes.json' with {type:'json'};
import { writeFileSync } from "fs";
import { cleanTrailingSlash } from "../Util.js";
const getArtById = (artId: ArtId) => {
    for (const art of allNotes) {
        if (art._id === artId) return art;
    }
    return null;
}

type ArtBlock = {
    input: Buffer;
    top: number;
    left: number;
}

export class StitchedImage implements LayoutImage {
    
    layout: Layout;
    name: string;
    buffer?: Buffer;

    constructor(layout: Layout) {

        if (!layout) throw new Error('Image requires a layout');
        this.layout = layout;
        this.name = `${this.layout.name}-stitch`;
    };

    async generate (options: GenerateImageOptions): Promise<StitchedImage> {

        const noteImageSize = this.layout.noteImageSize;

        console.log('Beginning stitched image generation...');

        const totalEstimate = this.layout.numRows * this.layout.numCols;
        let totalCount = 0, totalDone = 0;

        for (const row of this.layout.array) for (const item of row) totalCount++;

        const blocks: ArtBlock[] = [];

        this.layout.array.forEach(async (row, y, array) => {
            row.forEach(async (artId, x, row) => {
                // Every 10 times this runs is approx. 45s
                try {
                    const artObj = getArtById(artId);
                    const art = new Art(artObj)
                    
                    if (!art.thumbnailExists(noteImageSize)) {
                        await art.generateThumbnail(noteImageSize, {
                            saveFile: false
                        });
                    }

                    const artBuffer = await art.loadThumbnail(noteImageSize);

                    const artBlock: ArtBlock = {
                        input: artBuffer,
                        top:y*noteImageSize,
                        left:x*noteImageSize
                    }

                    blocks.push(artBlock);

                    totalDone++;
                    console.log(`[${totalDone}/${totalEstimate}] ${art.origName} fetched...`);
                }
                catch (e) {
                    totalDone++;
                    console.error(e);
                }
            });

        })

        // Wait until all images are processed
        await new Promise((resolve) => {
            const intervalId = setInterval(() => {
                if (totalDone === totalCount) {
                    clearInterval(intervalId);
                    resolve(totalDone);
                };
            }, 100);
        })

        console.log(`Loaded ${totalDone} images. Stitching...`);
        // Generate large blank image in temp folder
        let canvas = await sharp({
            create: {
                width:noteImageSize*this.layout.numCols,
                height:noteImageSize*this.layout.numRows,
                channels: 4,
                background: { r: 48, g: 48, b: 48, alpha: 1 } // #303030 - same as site background
            }
        }).composite(blocks).tiff({
            pyramid:true,
            tile:true
        }).toBuffer();

        this.buffer = canvas;
        console.log('Pattern fully stitched.');

        if (options?.saveFile) {
            writeFileSync(`${cleanTrailingSlash(options.outputDir)}/${this.name}.tif`, canvas);
            console.log('Successfully wrote pyramid TIFF to output directory.');
        }

        return this;
    };
}