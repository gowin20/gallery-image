// from files
import layout25Raw from '../data/layout-25.json' with {type:'json'};
import layout1000 from '../data/layout-1000.json' with {type:'json'};
import allLayouts from '../data/all-layouts.json' with {type:'json'};
import { type LayoutObject } from './gallery-image.js';

export const layout25 = layout25Raw;
export const layoutDefault = layout1000;

export const getLayoutById = (layoutId: string): LayoutObject | null => {
    for (const layout of allLayouts) {
        if (layout._id === layoutId) return layout;
    }
    return null;
}