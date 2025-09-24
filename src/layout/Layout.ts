import fs from 'fs';
import type { LayoutObject, ArtId, LayoutId } from '../gallery-image.js';
import { getLayoutById } from '../db-connect.js';
import type { GenerateImageOptions } from '../image/LayoutImage.js';

const dzi = (layout) => {
    console.log('DZI')
    return;
}
const stitchedImage = (layout) => {
    console.log('Stitched image');
    return;
}
const dziFromStitch = (layout) => {
    console.log('DZI from stitch');
    return;
}

// note becomes generic "art" class
// layout is a layout of art


type LayoutExistsOptions = {
    layoutId: string
}
export type LayoutOptions = {
    name: string;
    // Options for a preset arrangement of notes
    array?: ArtId[][];
    // Options for a specific set of notes in random order
    artIds?: ArtId[];
    ratio: number;
    numRows: number;
    numCols: number;
    /**
     * Required, size of each image in the layout. TODO DETERMINE THIS DYNAMICALLY FROM ART PROPERTIES
     */
    noteImageSize?: number;
}




/*
const createLayout;
Creates a functional layout object of notes and images
Inputs: 
* pattern: a 2D array containing Note ObjectIDs

Output:
* Uploads a directory of DZI files to AWS S3 bucket
* Inserts a layout object to Mongo Atlas
* Returns the ObjectID of the newly inserted layout object

Side effects:
* Generates large temp files which are deleted upon program termination

*/
export const TEMP_LAYOUT_DIR = `./wall/temp/`;

export class Layout {
    /**
     * Database ID
     */
    _id: string;
    /**
     * Name of layout
     */
    name: string;
    /**
     * ID of image representing layout
     */
    image: LayoutId;
    /**
     * Array containing IDs of individual images
     */
    array: ArtId[][];
    /**
     * Equivalent to length of array
     */
    numRows: number;
    /**
     * Equivalent to length of inner arrays
     */
    numCols: number;
    /**
     * All of the art in this layout uses a consistent image size.
     */
    noteImageSize: number;

        /**
     * Convenience method to quickly load a layout from datatabase ID. Requires external 'getLayoutById'
     * @param options 
     * @returns 
     */
    static async fromDb(options: LayoutExistsOptions): Promise<Layout> {
        if (!options?.layoutId) throw new Error('No layout ID provided.');

        const layout = new Layout();
        await layout.loadFromDb(options.layoutId);

        return layout;
    }
    /**
     * Initialize a new layout from command options
     * @param options 
     * @returns 
     */
    static async fromOptions(options: LayoutOptions): Promise<Layout> {
        const layout = new Layout();
        await layout.createFromOptions(options);

        return layout;
    }

    constructor(options?: LayoutOptions | LayoutExistsOptions) {
        if ((options as LayoutExistsOptions)?.layoutId) this._id = (options as LayoutExistsOptions).layoutId

    }    

    async loadFromDb(layoutId: LayoutId): Promise<Layout> {

        const layoutObj = await getLayoutById(layoutId);
        if (!layoutObj) throw new Error('No existing layout found in DB.');

        this._id = layoutId;
        this.name = layoutObj.name;
        this.array = layoutObj.array;
        this.image = layoutObj.image;
        this.numCols = layoutObj.numCols;
        this.numRows = layoutObj.numRows;
        this.noteImageSize = layoutObj.noteImageSize;

        return this;
    }

    async createFromOptions(options: LayoutOptions): Promise<void> {
        
        if (!this.name && !options.name) {
            throw new Error('No layout name provided.');
        }
        else if (!this.name) this.name = options.name;

        this.noteImageSize = options.noteImageSize || 288;

        if (options.array) { 
            // Use provided 2D array of art
            this.array = options.array;

            if (options.numCols || options.numRows) throw new Error('Cannot set width or height of layout when a pattern is provided.');
            if (options.ratio) throw new Error('Cannot set aspect ratio of layout when a pattern is provided.');
        }
        else {
            // Create random array based on list of art
            if (!options.artIds) throw new Error('No art IDs passed for random pattern generation.');

            if ((options.numRows || options.numCols) && options.ratio) throw new Error('Cannot pass both numRows\/numCols and ratio.');

            if (options.numCols && options.numRows) {
                // Preset number of rows and columns
                this.numRows = options.numRows;
                this.numCols = options.numCols;
            }
            
            this.array = await this._makeRandomPattern({
                artIds: options.artIds,
                ratio: options.ratio ? options.ratio : 9/16
            });
            
            this.numRows = this.array.length;
            this.numCols = this.array[0].length;
        }

        return;
    }
    
    /**
     * Generates a random pattern of notes based on input list
     * @param options 
     * @returns 
     */
    async _makeRandomPattern(options: {artIds: ArtId[], ratio: number}) {
        if (this._id) throw new Error('Layout was initialized with an ID. Cannot make random pattern.')
        console.log('Creating random pattern...')
    
        if (!options.artIds) throw new Error('No art provided to \'makeRandomPattern()\'');
    
        const totalNotes = options.artIds.length;
    
        let width, height;
        if (this.numCols && this.numRows) { // Use number of rows and cols if available
            width = this.numCols;
            height = this.numRows;
            // TODO edge case of "more notes than available space in layout"
        }
        else {
            // Otherwise use a ratio instead (Default 16:9)
            height = Math.ceil(Math.sqrt(totalNotes/options.ratio));
            width = Math.ceil(height*options.ratio);
        
            if ((width-2)*height >= totalNotes) width -= 2;
            if ((width-1)*height >= totalNotes) width -= 1;
            if (width*(height-1) >= totalNotes) height -= 1;
        }
    
        const pattern: ArtId[][] = [];
        const usedNotes = new Set();
    
        for (let row=0;row<height;row++) {
            const thisRow = [];
            for (let col=0;col<width;col++) {
                if (usedNotes.size >= totalNotes) {
                    break;
                }
       
                let i;
                do {
                    i = Math.floor(Math.random()*totalNotes);
                } while (usedNotes.has(i));
        
                thisRow.push(options.artIds[i])
                usedNotes.add(i);
            }
            pattern.push(thisRow);
        }
    
        console.log(`Width:${pattern[0].length}\nHeight: ${pattern.length}`);
        return pattern;
    }

    toJson(): LayoutObject {
        return {
            _id:this._id,
            name: this.name,
            noteImageSize:this.noteImageSize,
            numRows:this.numRows,
            numCols:this.numCols,
            array: this.array,
            image: this.image
        };
    }

    async generateImage(options: GenerateImageOptions): Promise<void> {
        console.log('Generating layout image...');

        const LAYOUT_DIR = TEMP_LAYOUT_DIR+this.name;
        

        if (options.filePath && !fs.existsSync(`${LAYOUT_DIR}/`)) {
            fs.mkdirSync(`${LAYOUT_DIR}/`);
            console.log(`Created output directory ${LAYOUT_DIR}`);
        }

        let imageObj;

        switch (options.outputType) {
            case 'DZI':
                throw new Error('DZI has not been implemented');
                imageObj = await dzi(this.toJson());
                break;
            case 'DZIFromStitch':
                console.log('[START] Creating DZI and stitched image...')
                imageObj = await dziFromStitch(this.toJson());
                break;
            case 'stitch':
                console.log(`[START] Creating stitched image...`);
                imageObj = await stitchedImage(this.toJson());
                break;
            default:
                throw new Error('Invalid output format provided to createLayoutImage')
        }

        await imageObj.init({saveFiles:this.saveFiles}, (imageObj) => {
            console.log(`[DONE] Layout image generated. ${options.filePath ? `Files saved to ${LAYOUT_DIR}.` : ''}`)
        })

        // Insert layout object to mongo atlas
        if (options.insert) {
            // Upload image files to S3
            console.log('[BEGIN S3 UPLOAD]');
            const imageUrl = await imageObj.uploadToS3();
            console.log(`Successfully uploaded DZI to ${imageUrl}`);
            // Insert image object into DB and retrieve ObjectId
            const imageId = await imageObj.insert();

            // 6. update layout object with dzi metadata and S3 URL
            this.image = imageId;

            const resId = await this.insert();
            console.log(`Successfully inserted layout to Atlas with ID ${resId}.`)
        }

        // Save layout JSON to disk
        if (options.filePath) {
            const jsonName = `${LAYOUT_DIR}/${this.name}-layout.json`;
            fs.writeFileSync(jsonName, JSON.stringify(this.toJson()));
            console.log(`Saved ${jsonName}`);
        }    
    }

    async insert() {
        throw new Error('Method \'insert()\' must be implemented.');
    }

    async patchImage() {
        // 1 implement this: uploading a single note to an existing layout
        // will need to implement 'DZI' class 'generate' and 'update' methods
    }

    async uploadLayout() {
        // TODO
    }
    async saveFiles() {
        //TODO
    }
    async startGeneration() {
        //TODO
    }
}