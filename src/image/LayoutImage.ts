import type { ImageObject, GenerateImageOptions } from '../types.js';
import type { Layout } from '../layout/Layout.js';

export interface LayoutImage {
    /**
     * Image name
     */
    name: string;
    /**
     * Associated layout
     */
    layout: Layout;
    /**
     * Name used for associated image thumbnails
     */
    thumbnailName: string;
    /**
     * 
     * @param options 
     * @returns 
     */
    generate: (options: GenerateImageOptions) => Promise<LayoutImage>;

    insertToDb?: () => Promise<ImageObject>;
    uploadToS3?: () => Promise<string>;
    encrypt?: () => Promise<void>;
}