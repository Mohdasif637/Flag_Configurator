import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export const textureLoader = new THREE.TextureLoader();

export const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/libs/draco/');

export const modelLoader = new GLTFLoader();
modelLoader.setDRACOLoader(dracoLoader);

export const environmentLoader = new HDRLoader();

export const exrLoader = new EXRLoader();
exrLoader.setDataType(THREE.FloatType);
