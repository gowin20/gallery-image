import type { GenerateImageOptions } from './ImageResource.js';
import { LayoutImage } from './LayoutImage.js';
import { log, saveFile, setupLogging, LogLevel, getJsonResource } from './Util.js';
import type { ArtObject, GenerateIiifOptions } from './Art.js';
import { Art } from './Art.js';
import { Canvas, Collection, Manifest } from '@iiif/presentation-3';

export type LayoutId = string;

export interface LayoutObject {
    /**
     * Unique layout identifier
     */
    id: string;
    /**
     * Name of layout
     */
    name: string;
    /**
     * URL of image representing layout
     */
    image: ArtObject;
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
    /**
     * Required, name of layout
     */
    name: string;
    /**
     * Required, size of each image in the layout. TODO DETERMINE THIS DYNAMICALLY FROM ART PROPERTIES
     */
    thumbnailSize: number | 'auto';
    // TODO map input options to this
    //art: ArtObject[][] | ArtObject[];
    // Options for a preset arrangement of notes
    array?: ArtObject[][];
    // Options for a specific set of notes in random order
    artList?: ArtObject[];
    ratio?: number;
    numRows?: number;
    numCols?: number;

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

const unpackArtArray = (artObjectArray: ArtObject[][]): Art[][] => {
    const artArray: Art[][] = [];
    for (const [i,row] of artObjectArray.entries()) {
        artArray.push([])
        for (const artObject of row) {
            artArray[i].push(new Art(artObject));
        }
    }
    return artArray;
}

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
    array: Art[][];
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
            this.array = unpackArtArray(layoutObj.array);
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

    createFromOptions(options: LayoutOptions): void {
        
        if (!this.name && !options.name) {
            throw new Error('No layout name provided.');
        }
        else if (!this.name) this.name = options.name;

        if (options.thumbnailSize) {
            this.thumbnailSize = options.thumbnailSize === 'auto' ? 288 : options.thumbnailSize;
        }
        else this.thumbnailSize = 288;

        if (options.array) { 
            // Use provided 2D array of art
            this.array = unpackArtArray(options.array);

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

    async getMaxThumbnailSize(thumbnailSize:number | 'auto'): Promise<number> {
        // TODO
        // iterates through entire array, checking width and height of each Art
        // finds the minimum number, or the average, and returns a smart thumbnail size that maximizes resolution
        if (thumbnailSize === 'auto') thumbnailSize = 288;
        return thumbnailSize || 288;
    }

    toJson(): LayoutObject {
        const artObjectArray: ArtObject[][] = this.array.map(row => row.map(art => art.toArtObject()));
        //if (typeof this.image !== 'string') throw new Error('Cannot cast layout to JSON that contains an image subclass.');
        return {
            id:this.id,
            name: this.name,
            thumbnailSize:this.thumbnailSize,
            numRows:this.numRows,
            numCols:this.numCols,
            array: artObjectArray,
            image: this.image.toArtObject() // URL of image
        } as LayoutObject;
    }

    async generateImage(options: GenerateImageOptions & {
        /**
         * Whether to overwrite the existing image on file
         */
        overwrite?: boolean;
    }): Promise<void> {
        setupLogging(options?.logLevel ? options.logLevel : 'standard', this.id);
        if (this.image) throw new Error('Image already exists. Please pass `overwrite: true` to overwrite existing image.');
        if (!options || !options.outputType) throw new Error('Must specify an output file type.');
        log('Generating layout image...');

        this.image = new LayoutImage(this);

        // Generate image using subclass, potentially save files to disk
        this.image.source = await this.image.generateImage(options);

        // Save layout JSON to disk
        if (options.saveFile) {
            saveFile(`${this.name}-layout.json`, JSON.stringify(this.toJson(), null, 2), options);
            log(`Saved ${this.name} as a layout.`);
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
    _makeRandomPattern(options: {artList: ArtObject[], ratio: number, logLevel?: LogLevel}): Art[][] {
        
        if (this.id) throw new Error('Layout was initialized with an ID. Cannot make random pattern.')
        if (!options.artList) throw new Error('No art provided to \'makeRandomPattern()\'');
    
        setupLogging(options?.logLevel ? options.logLevel : 'standard',this.id);
        log('Creating random pattern...')
        
        const totalNotes = options.artList.length;
    
        let width: number, height: number;
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
    
        const pattern: Art[][] = [];
        const usedNotes = new Set();
    
        for (let row=0;row<height;row++) {
            const thisRow = [];
            for (let col=0;col<width;col++) {
                if (usedNotes.size >= totalNotes) {
                    break;
                }
       
                let i: number;
                do {
                    i = Math.floor(Math.random()*totalNotes);
                } while (usedNotes.has(i));

                thisRow.push(new Art(options.artList[i]))
                usedNotes.add(i);
            }
            pattern.push(thisRow);
        }
    
        log(`Width:${pattern[0].length}\nHeight: ${pattern.length}`);
        return pattern;
    }
    // creates an array filled with random notes based on a template
    _randomFromTemplate(template: ArtObject[][]) {
        /**
         * 0 0 1
         * 1 1 0
         * 0 1 0
         */

        // TODO
    }

    async arrayToIiif(type: 'Manifest' | 'Collection', options: GenerateIiifOptions): Promise<Manifest | Collection> {

        const createIiifArt = async (type: 'Manifest' | 'Canvas', options: GenerateIiifOptions) => {
            
            const items: any[] = [];

            const artToIiif = async (art: Art, type: 'Manifest' | 'Canvas'): Promise<Canvas | Manifest> => {
                if (type === 'Manifest') return await art.toIiifManifest(art.id, options);
                else if (type === 'Canvas') return await art.toIiifCanvas(`${art.id}/canvas`, options);
            }

            for (const [i, row] of this.array.entries()) {
                for (const art of row) {
                    const iiif = await artToIiif(art,type);
                    items.push(iiif)
                }
            }
            if (type === 'Canvas') return items as Canvas[];
            else if (type === 'Manifest') return items as Manifest[];
        }

        const iiifBase = {
            "@context": "http://iiif.io/api/presentation/3/context.json",
            id:`${this.id}-contents`,
            label: {
                "en": [this.name]
            },
        }

        if (type === 'Manifest') {
            const iiifOutput: Manifest = {
                ...iiifBase,
                type:"Manifest",
                items: await createIiifArt('Canvas',{saveFile:false, exclude:[]}) as Canvas[]
            };
            return iiifOutput;
        }
        else if (type === 'Collection') {
            const iiifOutput: Collection = {
                ...iiifBase,
                type:"Collection",
                items: await createIiifArt('Manifest',{saveFile:false, exclude:[]}) as Manifest[]
            }
            return iiifOutput;
        }
        else throw new Error('Invalid IIIF type passed');
    }

    static async randomFromIiif(iiif: any, options): Promise<Layout> {

        // determine type of iiif
        // only support manifest right now

        const iiifObject = await getJsonResource(iiif);

        const artList: ArtObject[] = [];
        if (iiifObject.type === 'Collection') {

            const collection = iiifObject as Collection;

            for (const manifest of collection.items) {

                for (const canvas of manifest.items) {
                    const artObject = await Art.fromIiif(canvas, {output:'artObject'}) as ArtObject;
                    artList.push(artObject);
                }
            }
        }
        else if (iiifObject.type === 'Manifest') {
            const manifest = iiifObject as Manifest;

            for (const canvas of manifest.items) {
                const artObject = await Art.fromIiif(canvas, {output:'artObject'}) as ArtObject;
                artList.push(artObject);
            }
        }
        else throw new Error('Invalid IIIF object passed. Please provide a Collection or Manifest.');
        // read in art as Canvases -- output as art object, rather than Art
        // create array of art list

        // determine dimensions
        let thumbnailSize: number, i=0;
        // Check cached dimensions
        while (!thumbnailSize && i < artList.length) {
            if (artList[i].dimensions) {
                thumbnailSize = artList[i].dimensions.width;
                break;
            }
            else {
                i++;
            }
        }
        // Manually check dimensions
        if (!thumbnailSize) {
            const testArt = new Art(artList[0]);
            const dimensions = await testArt.source.getDimensions();
            thumbnailSize = dimensions.width;
        }
    
        // then create new layout
        const layout = new Layout({
            name: iiifObject.label,
            artList: artList,
            thumbnailSize: thumbnailSize
        })
        return layout;
    }

}