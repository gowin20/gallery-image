import { Layout } from "./layout/Layout.js";

import packageInfo from '../package.json' with {type:'json'};

const version = packageInfo.version;

export type LayoutId = string;
export type ArtId = string;

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
}

export {
    Layout,
    version as VERSION
}