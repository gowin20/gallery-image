import { LayoutImage } from "./LayoutImage.ts";

export type LayoutId = string;
export type ImageId = string;
export type ArtId = string;
export type ArtistId = string;

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
    _id: string;
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
     * All of the art in this layout uses a consistent image size.
     */
    noteImageSize: number;
}


export interface OldArtObject {
    /**
     * Database ID
     */
    _id: string;
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
        [_:`s-${number}px`]: URL | string;
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

export interface ArtObject {
    /**
     * Database ID
     */
    _id: string;
    /**
     * Original source of image
     */
    source: URL | string | Buffer;
    /**
     * Full resolution image as tif
     */
    image: URL | string | Buffer;
    /**
     * Thumbnail versions of the art, cached or in memory, of different sizes
     */
    thumbnails: {
        [_:`s-${number}px`]: URL | string | Buffer;
    };
    /**
     * Properties and metadata
     */
    metadata: ArtMetadata;
}

export type ArtMetadata = {
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
     * Date of creation
     */
    date?: string | Date;
    /**
     * Location where it was created
     */
    location?: string;
}

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


export type GenerateImageOptions = {
    /**
     * Whether to save the output image as a file
     */
    saveFile: boolean;
    /**
     * Output directory
     */
    outputDir?: string;
    /**
     * 
     */
    outputType?: 'tif' | 'tiff' | 'dzi' | 'iiif';
}