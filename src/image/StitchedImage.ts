import { Layout } from "../gallery-image.js";
import { GenerateImageOptions, LayoutImage } from "./LayoutImage.js";

export class StitchedImage implements LayoutImage {
    name: string;
    thumbnailName: string;
    layout: Layout;

    constructor(options) {

        if (!options.layout) throw new Error('Image requires a layout');
        this.layout = options.layout;

        this.name = `${this.layout.name}-stitch`;
        this.thumbnailName = `s-${this.layout.noteImageSize}px`;
    };

    async generate (options: GenerateImageOptions): Promise<StitchedImage> {
        // TODO
        return this;
    };
}