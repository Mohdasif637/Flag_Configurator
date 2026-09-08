import * as THREE from 'three';
import { vatMaterials, updateVatUniforms, getVatTextures, vatCache } from './vatLoader.js';
import { configState } from '../state/configState.js';

/**
 * Injects Vertex Animation Texture (VAT) vertex transformation and normal unpacking
 * into Three.js MeshPhysicalMaterial / MeshStandardMaterial shaders.
 * 
 * @param {THREE.Material} material - Flag material to inject shader code into.
 * @param {Object} options - Shader injection options.
 * @param {THREE.Texture} options.posTexture - Position EXR texture.
 * @param {THREE.Texture} options.normTexture - Normal EXR texture.
 * @param {number} options.frameCount - Total animation frames.
 * @param {number} [options.fps=30.0] - Target animation FPS.
 */
export function injectVATShader(material, { posTexture, normTexture, frameCount = 1.0, fps = 30.0 }) {
    if (!vatMaterials.includes(material)) {
        vatMaterials.push(material);
    }

    if (material.userData.shaderInjected) return;
    material.userData.shaderInjected = true;

    material.onBeforeCompile = (shader) => {
        const currentTextures = getVatTextures();
        const currentSizeCode = (configState.size || '').split(' ').pop().toLowerCase();
        const currentVatData = vatCache[currentSizeCode];
        const activeFrameCount = currentVatData ? currentVatData.info.frame_count : frameCount;
        const activePosTex = currentTextures.positions || posTexture;
        const activeNormTex = currentTextures.normals || normTexture;

        shader.uniforms.posTexture = { value: activePosTex };
        shader.uniforms.normTexture = { value: activeNormTex };
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uTotalFrames = { value: activeFrameCount };
        shader.uniforms.uFps = { value: fps };

        material.userData.shader = shader;
        if (!material.userData.compiledShaders) {
            material.userData.compiledShaders = [];
        }
        if (!material.userData.compiledShaders.includes(shader)) {
            material.userData.compiledShaders.push(shader);
        }

        // Declare VAT uniforms and UV attributes (supporting up to 10 UV channels)
        let declarations = `
            uniform sampler2D posTexture;
            uniform sampler2D normTexture;
            uniform float uTime;
            uniform float uTotalFrames;
            uniform float uFps;
            attribute vec2 vatPositionUv;
        `;

        for (let i = 4; i <= 10; i++) {
            declarations += `attribute vec2 uv${i};\n`;
        }

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            declarations + '\n#include <common>'
        );

        // Inject vertex normal recalculation using decoded normal texture
        shader.vertexShader = shader.vertexShader.replace(
            '#include <beginnormal_vertex>',
            `
            #include <beginnormal_vertex>
            
            float frame = mod(uTime * uFps, uTotalFrames) / uTotalFrames;
            vec2 finalUv = vec2(vatPositionUv.x, vatPositionUv.y - frame);
            
            vec4 texNorm = texture2D(normTexture, finalUv);
            if (length(texNorm.xyz) > 0.0001) {
                vec3 unpackedNormal = texNorm.xyz * 2.0 - 1.0;
                objectNormal = unpackedNormal.xzy; 
            }
            `
        );

        // Inject vertex position transformation using decoded position texture
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            
            vec4 texPos = texture2D(posTexture, finalUv);
            if (length(texPos.xyz) > 0.0001) {
                transformed = texPos.xzy; 
            }
            `
        );
    };
}

/**
 * Injects VAT vertex positioning into shadow/depth materials so animated cloth casts accurate shadows.
 * 
 * @param {THREE.MeshDepthMaterial} depthMaterial
 * @param {Object} options
 * @param {THREE.Texture} options.posTexture
 * @param {number} options.frameCount
 * @param {number} [options.fps=30.0]
 */
export function injectDepthVATShader(depthMaterial, { posTexture, frameCount = 1.0, fps = 30.0 }) {
    if (!vatMaterials.includes(depthMaterial)) {
        vatMaterials.push(depthMaterial);
    }

    depthMaterial.onBeforeCompile = (shader) => {
        const currentTextures = getVatTextures();
        const currentSizeCode = (configState.size || '').split(' ').pop().toLowerCase();
        const currentVatData = vatCache[currentSizeCode];
        const activeFrameCount = currentVatData ? currentVatData.info.frame_count : frameCount;
        const activePosTex = currentTextures.positions || posTexture;

        shader.uniforms.posTexture = { value: activePosTex };
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uTotalFrames = { value: activeFrameCount };
        shader.uniforms.uFps = { value: fps };

        depthMaterial.userData.shader = shader;
        if (!depthMaterial.userData.compiledShaders) {
            depthMaterial.userData.compiledShaders = [];
        }
        if (!depthMaterial.userData.compiledShaders.includes(shader)) {
            depthMaterial.userData.compiledShaders.push(shader);
        }

        let declarations = `
            uniform sampler2D posTexture;
            uniform float uTime;
            uniform float uTotalFrames;
            uniform float uFps;
            attribute vec2 vatPositionUv;
        `;
        for (let i = 4; i <= 10; i++) {
            declarations += `attribute vec2 uv${i};\n`;
        }

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            declarations + '\n#include <common>'
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            float frame = mod(uTime * uFps, uTotalFrames) / uTotalFrames;
            vec4 texPos = texture2D(posTexture, vec2(vatPositionUv.x, vatPositionUv.y - frame));
            vec3 transformed = position;
            if (length(texPos.xyz) > 0.0001) {
                transformed = texPos.xzy; 
            }
            `
        );
    };
}
