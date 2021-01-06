import {Domhandler, SsvgElement} from './domhandler';
import {VdomNode} from '../util/vdom/vdom';
import {DrawingUtils} from '../canvasworker/drawingUtils';
import {VdomManager} from '../util/vdom/vdom-manager';
import {safeErrorLog} from '../util/safelogs';

export class Interactionhandler {
    private interactionSelections: SsvgElement[] = [];
    private hoveredElement: Element | undefined;
    private position: {x: number; y: number};
    private canvas: HTMLCanvasElement;
    private svg: SVGElement & SsvgElement;
    private domHandler: Domhandler;
    private vdom: VdomManager;

    constructor() {}

    initialize(
        canvas: HTMLCanvasElement,
        svg: SVGElement & SsvgElement,
        domHandler: Domhandler,
        vdom: VdomManager
    ) {
        this.canvas = canvas;
        this.svg = svg;
        this.domHandler = domHandler;
        this.vdom = vdom;

        const rect = this.canvas.getBoundingClientRect();
        if (!('x' in rect)) {
            throw new Error('SVG position not found');
        }
        this.position = {x: rect.x, y: rect.y};

        this.setupListeners();
    }

    private setupListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.propagateMouseEvent(e));
        this.canvas.addEventListener('touchstart', (e) => this.propagateTouchEvent(e));
        this.canvas.addEventListener('mousemove', (e) => {
            const lastHovered = this.hoveredElement;
            this.hoveredElement = this.propagateMouseEvent(e);
            if (lastHovered !== this.hoveredElement) {
                if (lastHovered) {
                    lastHovered.dispatchEvent(new MouseEvent('mouseout', e));
                }
            }
            this.propagateMouseEvent(e, 'mouseover');
        });
        this.canvas.addEventListener('touchmove', (e) => {
            const lastHovered = this.hoveredElement;
            this.hoveredElement = this.propagateTouchEvent(e);
            if (lastHovered !== this.hoveredElement) {
                if (lastHovered) {
                    lastHovered.dispatchEvent(this.duplicateTouchEvent(e, 'mouseout'));
                }
            }
            this.propagateTouchEvent(e, 'mouseover');
        });
        this.canvas.addEventListener('mouseup', (e) => this.propagateMouseEvent(e));
        this.canvas.addEventListener('touchend', (e) => this.propagateTouchEvent(e));
        this.canvas.addEventListener('click', (e) => this.propagateMouseEvent(e));
        this.canvas.addEventListener('wheel', (e) => this.propagateWheelEvent(e));
    }

    captureD3On(el: SsvgElement) {
        if (el && this.interactionSelections.indexOf(el) === -1) {
            this.interactionSelections.push(el);
        }
    }

    private propagateMouseEvent(evt: MouseEvent, type?: string) {
        return this.propagateEvent(new MouseEvent(type ? type : evt.type, evt));
    }

    private duplicateTouchEvent(evt: TouchEvent, type?: string) {
        const e = document.createEvent('TouchEvent');
        if (!type) {
            type = evt.type;
        }
        e.initEvent(type, true, false);
        for (const prop in evt) {
            if (prop !== 'isTrusted' && evt.hasOwnProperty(prop)) {
                Object.defineProperty(e, prop, {
                    writable: true,
                    value: evt[prop],
                });
            }
        }
        Object.defineProperty(e, 'type', {
            writable: true,
            value: type,
        });
        const touches = [];
        for (let i = 0; i < evt.touches.length; i++) {
            const touch = evt.touches[i];
            touches.push({
                identifier: touch.identifier,
                pageX: touch.pageX,
                pageY: touch.pageY,
                clientX: touch.clientX,
                clientY: touch.clientY,
            });
        }
        Object.defineProperty(e, 'touches', {
            writable: true,
            value: touches,
        });
        return e;
    }

    private propagateTouchEvent(evt: TouchEvent, type?: string) {
        return this.propagateEvent(this.duplicateTouchEvent(evt, type));
    }

    private propagateWheelEvent(evt: WheelEvent) {
        return this.propagateEvent(new WheelEvent(evt.type, evt));
    }

    private propagateEvent(new_event: MouseEvent | TouchEvent | WheelEvent): undefined | Element {
        this.svg.dispatchEvent(new_event); // for EasyPZ

        let triggeredElement: undefined | Element;
        const {x, y} = Interactionhandler.getMousePosition(new_event);

        for (let interactionSel of this.interactionSelections) {
            let parentNode = this.domHandler.getVisNode(interactionSel);

            //let matchingVisParent = selectedNodes[i];
            let j = 1;

            if (!parentNode) {
                //console.error(interactionSel, parentSelector, parentNode);
            } else {
                for (let node of parentNode.children) {
                    let childNode = this.nodeAtPosition(node, x, y);

                    if (childNode) {
                        const element = this.domHandler.getElementFromNode(node);
                        const childElement = this.domHandler.getElementFromNode(childNode);

                        if (childElement) {
                            Object.defineProperty(new_event, 'target', {
                                writable: true,
                                value: childElement,
                            });
                        }

                        if (childElement) {
                            triggeredElement = childElement;
                            childElement.dispatchEvent(new_event);
                        }

                        if (element !== childElement) {
                            if (!triggeredElement) {
                                triggeredElement = element;
                            }
                            element.dispatchEvent(new_event);
                        }
                    }
                    j++;
                }
            }
        }
        return triggeredElement;
    }

    private static getMousePosition(event: MouseEvent | TouchEvent): {x: number; y: number} | null {
        let pos = {x: 0, y: 0};

        const mouseEvents = [
            'wheel',
            'click',
            'mousemove',
            'mousedown',
            'mouseup',
            'dblclick',
            'contextmenu',
            'mouseenter',
            'mouseleave',
            'mouseout',
            'mouseover',
        ];
        if (mouseEvents.indexOf(event.type) !== -1 && 'clientX' in event) {
            pos = {x: event['clientX'], y: event['clientY']};
        } else if (event.type.substr(0, 5) === 'touch') {
            const touches = event['touches'] ? event['touches'] : [];
            if (touches.length < 1) return null;
            pos = {x: touches[0].clientX, y: touches[0].clientY};
        } else {
            safeErrorLog('no event pos for event type ', event);
        }

        return pos;
    }

    private nodeAtPosition(visNode: VdomNode, x: number, y: number): false | VdomNode {
        x -= this.position.x;
        y -= this.position.y;

        if (visNode.type === 'circle') {
            let cx = this.vdom.get(visNode, 'cx') || 0;
            let cy = this.vdom.get(visNode, 'cy') || 0;
            if (visNode.transform) {
                const transform = DrawingUtils.parseTransform(visNode.transform);
                if (transform.translateX) {
                    cx += transform.translateX;
                }
                if (transform.translateY) {
                    cy += transform.translateY;
                }
            }
            const distance = Math.sqrt(Math.pow(cx - x, 2) + Math.pow(cy - y, 2));
            return distance < visNode.r ? visNode : false;
        } else if (visNode.type === 'rect' || visNode.type === 'image') {
            let elX = this.vdom.get(visNode, 'x') || 0;
            let elY = this.vdom.get(visNode, 'y') || 0;
            const width = visNode.width;
            const height = visNode.height;

            if (visNode.transform) {
                const transform = DrawingUtils.parseTransform(visNode.transform);
                if (transform.translateX) {
                    elX += transform.translateX;
                }
                if (transform.translateY) {
                    elY += transform.translateY;
                }
            }

            const centerX = elX + width / 2;
            const centerY = elY + height / 2;

            const distanceX = Math.abs(centerX - x);
            const distanceY = Math.abs(centerY - y);

            return distanceX < width / 2 && distanceY < height / 2 ? visNode : false;
        } else if (visNode.type === 'g') {
            const transform = this.domHandler.getTotalTransformation(visNode);
            if (transform.translateX) {
                x -= transform.translateX;
            }
            if (transform.translateY) {
                y -= transform.translateY;
            }

            let matchAny: false | VdomNode = false;
            for (let i = 0; i < visNode.children.length; i++) {
                if (this.nodeAtPosition(visNode.children[i], x, y)) {
                    matchAny = visNode.children[i];
                }
            }
            return matchAny;
        }
        return false;
    }
}
