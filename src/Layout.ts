import type { GenerateImageOptions } from './ImageResource.js';
import { LayoutImage } from './LayoutImage.js';
import { saveFile } from './Util.js';
import type { ArtId, ArtObject } from './Art.js';

export type LayoutId = string;

export interface DbLayoutObject {
    /**
     * Database ID
     */
    _id: string;
    /**
     * Name of layout
     */
    name: string;
    /**
     * URL of image representing layout
     */
    image: string | URL;
    /**
     * Array containing IDs of individual images
     */
    array: ArtId[][]; // Major difference in DB
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
}

export interface LayoutObject {
    /**
     * Database ID
     */
    id: string;
    /**
     * Name of layout
     */
    name: string;
    /**
     * URL of image representing layout
     */
    image: URL | string | LayoutImage;
    /**
     * Array of art images
     */
    array: ArtObject[][];
    /**
     * Equivalent to length of array
     */
    numRows: number;
    /**
     * Equivalent to length of inner arrays
     */
    numCols: number;
    /**
     * All of the art in this layout uses a consistent image size. Thumbnails are indexed by WIDTH
     */
    thumbnailSize: number;
}


type LayoutOptions = {
    name: string;
    // Options for a preset arrangement of notes
    array?: ArtObject[][];
    // Options for a specific set of notes in random order
    artList?: ArtObject[];
    ratio: number;
    numRows: number;
    numCols: number;
    /**
     * Required, size of each image in the layout. TODO DETERMINE THIS DYNAMICALLY FROM ART PROPERTIES
     */
    thumbnailSize?: number;
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
    id: string;
    /**
     * Name of layout
     */
    name: string;
    /**
     * ID of image representing layout
     */
    image: LayoutImage;
    /**
     * Array containing IDs of individual images
     */
    array: ArtObject[][];
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
    thumbnailSize: number;

    constructor(options?: LayoutOptions | LayoutObject) {
        // LayoutObject passed directly
        if ((options as LayoutObject).id) {
            const layoutObj = options as LayoutObject;

            this.id = layoutObj.id;
            this.name = layoutObj.name;
            this.array = layoutObj.array;
            //this.image = layoutObj.image;
            this.numCols = layoutObj.numCols;
            this.numRows = layoutObj.numRows;
            this.thumbnailSize = layoutObj.thumbnailSize;
        }
        // LayoutOptions passed
        else {
            options = options as LayoutOptions;
            this.createFromOptions(options);
        }
    }    

    async createFromOptions(options: LayoutOptions): Promise<void> {
        
        if (!this.name && !options.name) {
            throw new Error('No layout name provided.');
        }
        else if (!this.name) this.name = options.name;

        this.thumbnailSize = options.thumbnailSize || 288;

        if (options.array) { 
            // Use provided 2D array of art
            this.array = options.array;

            if (options.numCols || options.numRows) throw new Error('Cannot set width or height of layout when a pattern is provided.');
            if (options.ratio) throw new Error('Cannot set aspect ratio of layout when a pattern is provided.');

            this.numRows = this.array.length;
            this.numCols = this.array[0].length;
        }
        else {
            // Create random array based on list of art
            if (!options.artList) throw new Error('No art IDs passed for random pattern generation.');

            if ((options.numRows || options.numCols) && options.ratio) throw new Error('Cannot pass both numRows\/numCols and ratio.');

            if (options.numCols && options.numRows) {
                // Preset number of rows and columns
                this.numRows = options.numRows;
                this.numCols = options.numCols;
            }
            
            this.array = this._makeRandomPattern({
                artList: options.artList,
                ratio: options.ratio ? options.ratio : 9/16
            });
            
            this.numRows = this.array.length;
            this.numCols = this.array[0].length;
        }

        return;
    }

    toJson(db?:Boolean): LayoutObject | DbLayoutObject {
        const idArray = this.array.map(row => row.map(art => art.id));
        //if (typeof this.image !== 'string') throw new Error('Cannot cast layout to JSON that contains an image subclass.');
        if (db) {
            return {
                _id:this.id,
                name: this.name,
                noteImageSize:this.thumbnailSize,
                numRows:this.numRows,
                numCols:this.numCols,
                array: idArray,
                image: '' // URL of image
            } as DbLayoutObject;
        }
        else {
            return {
                id:this.id,
                name: this.name,
                thumbnailSize:this.thumbnailSize,
                numRows:this.numRows,
                numCols:this.numCols,
                array: this.array,
                image: '' // URL of image
            } as LayoutObject;
        }
    }

    async generateImage(options: GenerateImageOptions & {
        /**
         * Whether to overwrite the existing image on file
         */
        overwrite?: boolean;
    }): Promise<void> {

        if (this.image) throw new Error('Image already exists. Please pass `overwrite: true` to overwrite existing image.');
        if (!options || !options.outputType) throw new Error('Must specify an output file type.');
        console.log('Generating layout image...');

        this.image = new LayoutImage(this);

        // Generate image using subclass, potentially save files to disk
        await this.image.generateImage(options);

        // Save layout JSON to disk
        if (options.saveFile) {
            saveFile(`${this.name}-layout.json`, JSON.stringify(this.toJson(), null, 2), options);
            console.log(`Saved ${this.name} as a layout.`);
        }
    }

    async insert() {
        throw new Error('Method \'insert()\' must be implemented.');
    }

    async patchImage() {
        // TODO implement this: patch a single image to a position within an existing layout
    }
   
    /**
     * Generates a random pattern of notes based on input list
     * @param options 
     * @returns 
     */
    _makeRandomPattern(options: {artList: ArtObject[], ratio: number}): ArtObject[][] {
        if (this.id) throw new Error('Layout was initialized with an ID. Cannot make random pattern.')
        console.log('Creating random pattern...')
    
        if (!options.artList) throw new Error('No art provided to \'makeRandomPattern()\'');
    
        const totalNotes = options.artList.length;
    
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
    
        const pattern: ArtObject[][] = [];
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
        
                thisRow.push(options.artList[i])
                usedNotes.add(i);
            }
            pattern.push(thisRow);
        }
    
        console.log(`Width:${pattern[0].length}\nHeight: ${pattern.length}`);
        return pattern;
    }
    // creates an array filled with random notes based on a template
    _randomFromTemplate(template: ArtId[][]) {
        /**
         * 0 0 1
         * 1 1 0
         * 0 1 0
         */

        // TODO
    }

}