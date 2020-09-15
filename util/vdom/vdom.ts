export type VDOM = {
    width: number;
    height: number;
    scale: number;
} & VdomNode;

export type VdomNodeType = 'svg'|'g'|'rect'|'circle'|'path'|'title'|'tspan'|'text'|'image';

export type VdomNode = {
    style: {[styleName: string]: string},
    styleSpecificity: {[styleName: string]: number},
    type: VdomNodeType,
    children: VdomNode[],
    globalElementIndex: number,
    transform?: string,
    fill?: string,
    opacity?: number,
    d?: string,
    stroke?: string,
    strokeWidth?: string,
    cx?: number,
    cy?: number,
    r?: number,
    x?: number,
    y?: number,
    x1?: number,
    y1?: number,
    x2?: number,
    y2?: number,
    dx?: string,
    dy?: string,
    width?: number,
    height?: number,
    textAlign?: string,
    text?: string,
    href?: string,
    image?: ImageBitmap,
    className?: string,
    id?: string,
}
