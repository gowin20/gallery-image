import { Layout } from "./Layout.js";
import { Art } from "./Art.js";
import { ImageResource } from "./ImageResource.js";

import packageInfo from '../package.json' with {type:'json'};

const version = packageInfo.version;

export {
    Layout,
    Art,
    ImageResource,
    version as VERSION
}