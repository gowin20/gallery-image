import type { LayoutId } from './layout/Layout.js';
import type { ArtId } from './Art.js';
// from files
import layout25Raw from '../data/layout-25.json' with {type:'json'};
import layout1000 from '../data/layout-1000.json' with {type:'json'};
import allLayouts from '../data/all-layouts.json' with {type:'json'};

export const layout25 = layout25Raw;
export const layoutDefault = layout1000;

export interface LayoutDbInfo {
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


export const getLayoutById = (layoutId: string): LayoutDbInfo | null => {
    for (const layout of allLayouts) {
        if (layout._id === layoutId) return layout;
    }
    return null;
}