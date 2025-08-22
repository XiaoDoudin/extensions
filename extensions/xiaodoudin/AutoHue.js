// Name: Auto Hue
// ID: autohue
// Description: 能够获取来自URL链接的图片主题色，无论是上下左右中心点
// By: xiaodoudin
// License: MPL-2.0

/*
Auto Hue Extension
Copyright (C) 2025 xiaodoudin

This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at http://mozilla.org/MPL/2.0/.
*/

(function(Scratch) {
    'use strict';

    const autohue = (function() {
        "use strict";

        function rgbToLab(r, g, b) {
            let R = r / 255, G = g / 255, B = b / 255;
            R = R > .04045 ? Math.pow((R + .055) / 1.055, 2.4) : R / 12.92;
            G = G > .04045 ? Math.pow((G + .055) / 1.055, 2.4) : G / 12.92;
            B = B > .04045 ? Math.pow((B + .055) / 1.055, 2.4) : B / 12.92;
            let X = R * .4124 + G * .3576 + B * .1805;
            let Y = R * .2126 + G * .7152 + B * .0722;
            let Z = R * .0193 + G * .1192 + B * .9505;
            X = X / .95047;
            Y = Y / 1;
            Z = Z / 1.08883;
            const f = (t) => t > .008856 ? Math.pow(t, .3333333333333333) : 7.787 * t + .13793103448275862;
            const fx = f(X);
            const fy = f(Y);
            const fz = f(Z);
            const L = 116 * fy - 16;
            const a = 500 * (fx - fy);
            const bVal = 200 * (fy - fz);
            return [L, a, bVal];
        }

        function labDistance(lab1, lab2) {
            const dL = lab1[0] - lab2[0];
            const da = lab1[1] - lab2[1];
            const db = lab1[2] - lab2[2];
            return Math.sqrt(dL * dL + da * da + db * db);
        }

        function rgbToHex(rgb) {
            return "#" + rgb.map((v) => {
                const hex = Math.round(v).toString(16);
                return hex.length === 1 ? "0" + hex : hex;
            }).join("");
        }

        function loadImage(imageSource) {
            return new Promise((resolve, reject) => {
                let img;
                if (typeof imageSource === "string") {
                    img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.src = imageSource;
                    
                    const timeout = setTimeout(() => {
                        reject(new Error("Network error"));
                    }, 10000);
                    
                    img.onload = () => {
                        clearTimeout(timeout);
                        resolve(img);
                    };
                    
                    img.onerror = (err) => {
                        clearTimeout(timeout);
                        reject(new Error(`Error: ${err.message}`));
                    };
                } else {
                    img = imageSource;
                    if (img.complete) resolve(img);
                    else {
                        img.onload = () => resolve(img);
                        img.onerror = (err) => reject(err);
                    }
                }
            });
        }

        function getImageDataFromImage(img, maxSize = 100) {
            const canvas = document.createElement("canvas");
            let width = img.naturalWidth;
            let height = img.naturalHeight;
            if (width > maxSize || height > maxSize) {
                const scale = Math.min(maxSize / width, maxSize / height);
                width = Math.floor(width * scale);
                height = Math.floor(height * scale);
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Cannot access canvas context");
            ctx.drawImage(img, 0, 0, width, height);
            return ctx.getImageData(0, 0, width, height);
        }

        function clusterPixelsByCondition(imageData, condition, threshold = 10) {
            const clusters = [];
            const data = imageData.data;
            const width = imageData.width;
            const height = imageData.height;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (!condition(x, y)) continue;
                    const index = (y * width + x) * 4;
                    if (data[index + 3] === 0) continue;
                    const r = data[index];
                    const g = data[index + 1];
                    const b = data[index + 2];
                    const lab = rgbToLab(r, g, b);
                    let added = false;
                    for (const cluster of clusters) {
                        const d = labDistance(lab, cluster.averageLab);
                        if (d < threshold) {
                            cluster.count++;
                            cluster.sumRgb[0] += r;
                            cluster.sumRgb[1] += g;
                            cluster.sumRgb[2] += b;
                            cluster.sumLab[0] += lab[0];
                            cluster.sumLab[1] += lab[1];
                            cluster.sumLab[2] += lab[2];
                            cluster.averageRgb = [
                                cluster.sumRgb[0] / cluster.count,
                                cluster.sumRgb[1] / cluster.count,
                                cluster.sumRgb[2] / cluster.count
                            ];
                            cluster.averageLab = [
                                cluster.sumLab[0] / cluster.count,
                                cluster.sumLab[1] / cluster.count,
                                cluster.sumLab[2] / cluster.count
                            ];
                            added = true;
                            break;
                        }
                    }
                    if (!added) {
                        clusters.push({
                            count: 1,
                            sumRgb: [r, g, b],
                            sumLab: [lab[0], lab[1], lab[2]],
                            averageRgb: [r, g, b],
                            averageLab: [lab[0], lab[1], lab[2]]
                        });
                    }
                }
            }
            return clusters;
        }

        function __handleAutoHueOptions(options) {
            if (!options) options = {};
            const { maxSize = 100 } = options;
            let threshold = options.threshold || 10;
            if (typeof threshold === "number") {
                threshold = {
                    primary: threshold,
                    left: threshold,
                    right: threshold,
                    top: threshold,
                    bottom: threshold
                };
            } else {
                threshold = {
                    primary: threshold.primary || 10,
                    left: threshold.left || 10,
                    right: threshold.right || 10,
                    top: threshold.top || 10,
                    bottom: threshold.bottom || 10
                };
            }
            return { maxSize, threshold };
        }

        async function colorPicker(imageSource, options) {
            const { maxSize, threshold } = __handleAutoHueOptions(options);
            const img = await loadImage(imageSource);
            const imageData = getImageDataFromImage(img, maxSize);
            
            let clusters = clusterPixelsByCondition(imageData, () => true, threshold.primary);
            clusters.sort((a, b) => b.count - a.count);
            const primaryCluster = clusters[0];
            const secondaryCluster = clusters.length > 1 ? clusters[1] : clusters[0];
            
            const primaryColor = rgbToHex(primaryCluster.averageRgb);
            const secondaryColor = rgbToHex(secondaryCluster.averageRgb);
            
            const margin = 10;
            const width = imageData.width;
            const height = imageData.height;
            
            const topClusters = clusterPixelsByCondition(imageData, (_x, y) => y < margin, threshold.top);
            topClusters.sort((a, b) => b.count - a.count);
            const topColor = topClusters.length > 0 ? rgbToHex(topClusters[0].averageRgb) : primaryColor;
            
            const bottomClusters = clusterPixelsByCondition(imageData, (_x, y) => y >= height - margin, threshold.bottom);
            bottomClusters.sort((a, b) => b.count - a.count);
            const bottomColor = bottomClusters.length > 0 ? rgbToHex(bottomClusters[0].averageRgb) : primaryColor;
            
            const leftClusters = clusterPixelsByCondition(imageData, (x, _y) => x < margin, threshold.left);
            leftClusters.sort((a, b) => b.count - a.count);
            const leftColor = leftClusters.length > 0 ? rgbToHex(leftClusters[0].averageRgb) : primaryColor;
            
            const rightClusters = clusterPixelsByCondition(imageData, (x, _y) => x >= width - margin, threshold.right);
            rightClusters.sort((a, b) => b.count - a.count);
            const rightColor = rightClusters.length > 0 ? rgbToHex(rightClusters[0].averageRgb) : primaryColor;
            
            return {
                primaryColor,
                secondaryColor,
                backgroundColor: { top: topColor, right: rightColor, bottom: bottomColor, left: leftColor }
            };
        }

        return colorPicker;
    })();

    class AutoHueExtension {
        constructor(runtime) {
            this.runtime = runtime;
            this.colors = {
                "primary": "#000000",
                "secondary": "#FFFFFF",
                "topEdge": "#000000",
                "rightEdge": "#000000",
                "bottomEdge": "#000000",
                "leftEdge": "#000000"
            };
            this.status = "Not loaded";
        }

        getInfo() {
            return {
                id: "autohue",
                name: "Auto Hue",
                color1: "#4a90e2",
                color2: "#3066be",
                blocks: [
                    {
                        opcode: "extractColors",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "Extract colors from [IMAGE] with precision [THRESHOLD]",
                        arguments: {
                            IMAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: "Image URL (http or https)"
                            },
                            THRESHOLD: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 10,
                                menu: "thresholds"
                            }
                        }
                    },
                    {
                        opcode: "getPrimaryColor",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "primary color"
                    },
                    {
                        opcode: "getSecondaryColor",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "secondary color"
                    },
                    {
                        opcode: "getEdgeColor",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "[EDGE] edge color",
                        arguments: {
                            EDGE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "edges"
                            }
                        }
                    },
                    {
                        opcode: "getColorEffectValue",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "[COLOR_TYPE] color effect value",
                        arguments: {
                            COLOR_TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "colorTypes"
                            }
                        }
                    },
                    {
                        opcode: "getBrightnessValue",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "[COLOR_TYPE] brightness value",
                        arguments: {
                            COLOR_TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "colorTypes"
                            }
                        }
                    },
                    {
                        opcode: "getStatus",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "color extraction status"
                    }
                ],
                menus: {
                    thresholds: [
                        { text: "Precise", value: 5 },
                        { text: "Normal", value: 10 },
                        { text: "Smooth", value: 15 }
                    ],
                    edges: [
                        { text: "Top", value: "topEdge" },
                        { text: "Right", value: "rightEdge" },
                        { text: "Bottom", value: "bottomEdge" },
                        { text: "Left", value: "leftEdge" }
                    ],
                    colorTypes: [
                        { text: "Primary", value: "primary" },
                        { text: "Secondary", value: "secondary" },
                        { text: "Top Edge", value: "topEdge" },
                        { text: "Right Edge", value: "rightEdge" },
                        { text: "Bottom Edge", value: "bottomEdge" },
                        { text: "Left Edge", value: "leftEdge" }
                    ]
                }
            };
        }

        async extractColors(args) {
            try {
                this.status = "Processing";
                if (!args.IMAGE.startsWith("http://") && !args.IMAGE.startsWith("https://")) {
                    throw new Error("Image URL must start with http:// or https://");
                }
                
                const result = await autohue(args.IMAGE, {
                    threshold: parseInt(args.THRESHOLD, 10)
                });
                
                const validateAndSetColor = (key, value) => {
                    if (/^#([0-9A-F]{3}){1,2}$/i.test(value)) {
                        this.colors[key] = value;
                    } else {
                        console.warn(`Invalid color value ${value} ignored, using default`);
                    }
                };
                
                validateAndSetColor("primary", result.primaryColor);
                validateAndSetColor("secondary", result.secondaryColor);
                validateAndSetColor("topEdge", result.backgroundColor.top);
                validateAndSetColor("rightEdge", result.backgroundColor.right);
                validateAndSetColor("bottomEdge", result.backgroundColor.bottom);
                validateAndSetColor("leftEdge", result.backgroundColor.left);
                
                this.status = "Extraction successful";
            } catch (error) {
                this.status = `Extraction failed: ${error.message}`;
                console.error("Color extraction failed:", error);
            }
        }

        getPrimaryColor() {
            const color = this.colors["primary"] || "#000000";
            return color;
        }

        getSecondaryColor() {
            const color = this.colors["secondary"] || "#FFFFFF";
            return color;
        }

        getEdgeColor(args) {
            const color = this.colors[args.EDGE] || "#000000";
            return color;
        }

        getColorEffectValue(args) {
            try {
                const colorType = args.COLOR_TYPE || "primary";
                const color = this.colors[colorType] || "#000000";
                const rgb = this.hexToRgb(color);
                
                if (!rgb) {
                    return 0;
                }
                
                const hue = this.rgbToHue(rgb.r, rgb.g, rgb.b);
                const effectValue = Math.round((hue / 100) * 200);
                return Math.max(0, Math.min(200, effectValue));
            } catch (error) {
                this.status = `Failed to get color effect value: ${error.message}`;
                console.error("Failed to get color effect value:", error);
                return 0;
            }
        }

        getBrightnessValue(args) {
            try {
                const colorType = args.COLOR_TYPE || "primary";
                const color = this.colors[colorType] || "#000000";
                const rgb = this.hexToRgb(color);
                
                if (!rgb) {
                    return 0;
                }
                
                const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
                let brightnessValue = Math.round((luminance * 200) - 100);
                return Math.max(-100, Math.min(100, brightnessValue));
            } catch (error) {
                this.status = `Failed to get brightness value: ${error.message}`;
                console.error("Failed to get brightness value:", error);
                return 0;
            }
        }

        getStatus() {
            return this.status;
        }

        hexToRgb(hex) {
            try {
                if (!/^#([0-9A-F]{3}){1,2}$/i.test(hex)) {
                    throw new Error(`Invalid color format: ${hex}`);
                }
                
                let rHex, gHex, bHex;
                if (hex.length === 4) {
                    rHex = hex[1] + hex[1];
                    gHex = hex[2] + hex[2];
                    bHex = hex[3] + hex[3];
                } else {
                    rHex = hex.slice(1, 3);
                    gHex = hex.slice(3, 5);
                    bHex = hex.slice(5, 7);
                }
                
                const rgb = {
                    r: parseInt(rHex, 16),
                    g: parseInt(gHex, 16),
                    b: parseInt(bHex, 16)
                };
                
                if (isNaN(rgb.r) || isNaN(rgb.g) || isNaN(rgb.b) ||
                    rgb.r < 0 || rgb.r > 255 ||
                    rgb.g < 0 || rgb.g > 255 ||
                    rgb.b < 0 || rgb.b > 255) {
                    throw new Error(`Invalid RGB values: ${JSON.stringify(rgb)}`);
                }
                
                return rgb;
            } catch (error) {
                console.error("Color conversion failed:", error);
                return null;
            }
        }

        rgbToHue(r, g, b) {
            r /= 255;
            g /= 255;
            b /= 255;
            
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            let h = 0;
            
            if (max !== min) {
                const d = max - min;
                switch (max) {
                    case r:
                        h = (g - b) / d + (g < b ? 6 : 0);
                        break;
                    case g:
                        h = (b - r) / d + 2;
                        break;
                    case b:
                        h = (r - g) / d + 4;
                        break;
                }
                h /= 6;
            }
            
            const hueValue = Math.round(h * 100);
            return Number(hueValue);
        }
    }

    Scratch.extensions.register(new AutoHueExtension());
})(Scratch);
