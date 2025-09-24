import type { ImageObject, Layout } from "../gallery-image.js";

export type GenerateImageOptions = {
    /**
     * Whether to insert the image into a database
     */
    insert: boolean;
    /**
     * The path of a file string
     */
    filePath: string;
    /**
     * 
     */
    outputType: string;
}

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