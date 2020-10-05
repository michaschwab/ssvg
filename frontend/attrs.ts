import {VdomNodeType} from "../util/vdom/vdom";

export const CSS_STYLES = ['stroke', 'stroke-opacity', 'stroke-width', 'stroke-linejoin',
    'fill', 'fill-opacity', 'font', 'opacity', 'font-family', 'font-size'];

/*const RELEVANT_ATTRS2 = ['transform', 'd', 'id', 'r', 'fill', 'cx', 'cy', 'x', 'y', 'x1', 'x2', 'y1',
    'y2', 'opacity', 'fill-opacity', 'width', 'height', 'stroke', 'stroke-opacity', 'stroke-width',
    'font-size', 'font', 'font-family', 'text-anchor', 'href'];*/

//'svg'|'g'|'rect'|'circle'|'path'|'title'|'tspan'|'text'|'image'|'clippath'|'line'

export const RELEVANT_ATTRS: {[type in VdomNodeType]: string[]} = {
    'svg': ['fill', 'opacity', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width',
        'font-size', 'font', 'font-family', 'text-anchor'],
    'g': ['fill', 'opacity', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width',
        'font-size', 'font', 'font-family', 'text-anchor', 'clip-path'],
    'rect': ['fill', 'opacity', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'x','y',
        'width', 'height', 'clip-path'],
    'circle': ['fill', 'opacity', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'cx',
        'cy', 'r', 'clip-path'],
    'path': ['fill', 'opacity', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'd',
        'clip-path'],
    'title': [],
    'tspan': ['dx', 'dy'],
    'text': ['fill', 'opacity', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width',
        'font-size', 'font', 'font-family', 'text-anchor', 'href', 'x', 'y', 'dx', 'dy'],
    'image': ['opacity', 'x', 'y', 'width', 'height'],
    'clippath': ['id', 'fill', 'opacity', 'fill-opacity', 'stroke', 'stroke-opacity',
        'stroke-width'],
    'line': ['opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'x1', 'x2', 'y1','y2',
        'clip-path'],
};

const ROUNDED_ATTRS_ARR = ['cx', 'cy', 'r', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height',
    'stroke-width'];

export const ROUNDED_ATTRS = {};
for(const attr of ROUNDED_ATTRS_ARR) {
    ROUNDED_ATTRS[attr] = true;
}