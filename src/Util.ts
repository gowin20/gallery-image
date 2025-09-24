import fetch from "node-fetch";

export const getResourceBuffer = async (filePathOrUrl: string | URL): Promise<Buffer> => {
    let imageBuffer: Buffer;
    // If URL
    if (true) {
        const origImage = await fetch(filePathOrUrl);

        const imageBody = await origImage.arrayBuffer();

        imageBuffer = Buffer.from(imageBody);
    }
    // Otherwise, local file

    return imageBuffer;
}