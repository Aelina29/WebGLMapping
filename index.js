class Object {
    constructor(moving, gl, scale, center, pos, tex, norm, pos_ind, tex_ind, norm_ind) {
        this.moving = moving;
        this.gl = gl;
        pos = pos.map((point) => point * scale);
        this.center = center;
        this.full = [];  //по блокам

        for(let i=0; i < pos_ind.length; i++)
        {
            this.full.push(pos[pos_ind[i]*3]);
            this.full.push(pos[pos_ind[i]*3+1]);
            this.full.push(pos[pos_ind[i]*3+2]);
        }
        for(let i=0; i < tex_ind.length; i++)
        {
            this.full.push(tex[tex_ind[i]*2]);
            this.full.push(tex[tex_ind[i]*2+1]);
        }
        for(let i=0; i < norm_ind.length; i++)
        {
            this.full.push(norm[norm_ind[i]*3]);
            this.full.push(norm[norm_ind[i]*3+1]);
            this.full.push(norm[norm_ind[i]*3+2]);
        }

        // создание буфера вершин
        this.fullBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.fullBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.full), gl.STATIC_DRAW);
        
        this.full_vertex_count = pos_ind.length;
        this.full_texture_count = tex_ind.length;
    }

    getBuffers() {
        return {
            full_len: this.full.length,
            full: this.fullBuffer,
            full_vertex_count: this.full_vertex_count,
        };
    }

    setVertexes(programInfo) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.fullBuffer);
        
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
        gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
        
        gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
        gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, this.full_vertex_count*3 * Float32Array.BYTES_PER_ELEMENT);
        
        gl.enableVertexAttribArray(programInfo.attribLocations.normal);
        gl.vertexAttribPointer(programInfo.attribLocations.normal, 3, gl.FLOAT, false, 0, (this.full_vertex_count*3+this.full_texture_count*2) * Float32Array.BYTES_PER_ELEMENT);
    }

    toPosition(Matrix) {
        this.translate(Matrix, this.center);
    }

    translate(Matrix, translation) {
        return mat4.translate(Matrix, Matrix, translation);
    }

    rotate(Matrix, rad, axis) {
        return mat4.rotate(Matrix, Matrix, rad, axis);
    }

    rotateAround(Matrix, rad, point) {
        const translation = this.center.map((p, i) => p - point[i]);
        this.translate(Matrix, translation.map(p => -p));
        this.rotate(Matrix, rad, [0, 1, 0]);
        this.translate(Matrix, translation);
        return Matrix;
    }
}

const shaderFunctions = `
//скалярное произведение >= 0
float positive_dot(vec3 left, vec3 right) {
    return max(dot(left, right), 0.0);
}
        
float lambert(vec3 normal, vec3 lightPosition, float power) {
    return max(dot(normal, normalize(lightPosition)), 0.0) * power;
    // Рассчитываем и нормализуем направление на источник света
    //float3 L = normalize(_WorldSpaceLightPos0.xyz - i.pos_world.xyz);
    // После передачи во фрагментный шейдер нормаль тоже надо нормализовать
    //float3 N = normalize(i.normal);
    //return max(dot(L, N), 0.0);
}
        
float phong(vec3 normal, vec3 lightDir, vec3 viewPosition, float power, float shininess) {
    float diffuseLightDot = positive_dot(normal, lightDir);
    vec3 reflectionVector = normalize(reflect(-lightDir, normal));
    float specularLightDot = positive_dot(reflectionVector, -normalize(viewPosition));
    float specularLightParam = pow(specularLightDot, shininess);
    return (diffuseLightDot + specularLightParam) * power;
}
        
float blinn(vec3 normal, vec4 vertex, vec3 lightDir, vec3 viewPosition, float power, float shininess) {
    float lambertComponent = positive_dot(normal, lightDir);
    vec3 halfwayVector = normalize(lightDir - viewPosition);
    float specular = pow(positive_dot(halfwayVector, normal), shininess);
    return (lambertComponent + specular) * power;
}
        
float tynShaded(vec3 normal, vec3 lightPosition, float power) {
    float light = lambert(normal, lightPosition, power);

    if (light > 0.95) {
        light = 1.0;
    } else if (light > 0.5) {
        light = 0.8;
    } else if (light > 0.2) {
        light = 0.3;
    } else {
        light = 0.2;
    }

    return light;
}
        
float evaluateLighting(int shading, int current, int lightModel, vec3 normal, vec4 vertex,
                        vec3 lightDir, vec3 viewPosition, float power, float shininess) 
{
    float light = 1.0;
    if (shading == current) 
    {
        if (lightModel == 0) {
            light = lambert(normal, lightDir, power);   
        }
        else if (lightModel == 1) {
            light = phong(normal, lightDir, viewPosition, power, shininess);
        }
        else if (lightModel == 2) {
            light = tynShaded(normal, lightDir, power);   
        }
        else if (lightModel == 3) {
            light = blinn(normal, vertex, lightDir, viewPosition, power, shininess);
        }
    }
    return light;
}
        
float dampLight(int dampingFunction, float light) {
    float new_light = light;
        
    if (dampingFunction == 0) {
        new_light = light;   
    }
    else if (dampingFunction == 1) {
        new_light = light*light;
    }
            
    return new_light;
}`

var cubeVertexShader = `precision mediump float;
attribute vec4 aVertexPosition;
attribute vec2 aTextureCoord;
// attribute vec4 aVertexColor;
attribute vec3 aNormal;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

varying vec4 vPosition;
varying vec4 vColor;
varying vec3 vNormal;
varying vec2 vTextureCoord;

uniform float uLightPower;
uniform vec3 uLightDirection;
uniform lowp int uDampingFunction;
uniform lowp int uShading;
uniform lowp int uLightModel;
uniform float uLightShininess;
${shaderFunctions}
void main(void) {
    vec3 normal = normalize(mat3(uModelViewMatrix) * aNormal);
    gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    vPosition = aVertexPosition;
    vNormal = normal;
    vTextureCoord = aTextureCoord;
}`

var cubeFragmentShader = `precision mediump float;
uniform mat4 uModelViewMatrix;

varying vec4 vPosition;
varying vec3 vNormal;
varying vec2 vTextureCoord;

uniform float uLightPower;
uniform vec3 uLightDirection;
uniform lowp int uDampingFunction;
uniform lowp int uShading;
uniform lowp int uLightModel;
uniform float uLightShininess;

uniform sampler2D uSampler;
uniform float uStepSize;
${shaderFunctions}
void main(void) {
    float uStepSize = 0.00390625;

    vec3 xGradient = texture2D(uSampler, vec2(vTextureCoord.x - uStepSize, vTextureCoord.y)).xyz - texture2D(uSampler, vec2(vTextureCoord.x + uStepSize, vTextureCoord.y)).xyz;
    vec3 yGradient = texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y - uStepSize)).xyz - texture2D(uSampler, vec2(vTextureCoord.x, vTextureCoord.y + uStepSize)).xyz;
    vec3 normalMap = vNormal + vTextureCoord.x * xGradient + vTextureCoord.y * yGradient;
    vec3 N =  normalize(normalMap * 2.0 - 1.0);

    //N = vNormal;  //mapping off
    
    vec3 positionEye3 = vec3(uModelViewMatrix * vPosition);
    vec3 lightDirection = normalize(uLightDirection - positionEye3);

    int current = 0;

    float light = evaluateLighting(
        uShading, current, uLightModel, N, vPosition,
        lightDirection, positionEye3, uLightPower, uLightShininess);
    light = dampLight(uDampingFunction, light);

    gl_FragColor = vec4(1.0, 0.5, 0.0, 1.0); //vColor;
    gl_FragColor.rgb *= light;

    
    //gl_FragColor = vec4(gl_FragColor.rgb + 0.9 * vec3(0.5, 0.3, 0.01), 1.0);
    //gl_FragColor.rgb = vec3(gl_FragColor.rgb + 0.9 * vec3(0.5, 0.3, 0.01));    
    //gl_FragColor = gl_FragColor + vec4(0.9 * vec3(0.5, 0.3, 0.01), 1.0);
    gl_FragColor = gl_FragColor + vec4(0.9 * vec3(0.5, 0.3, 0.01), 0.01);
}`

//lighting==================================================================================
const sceneState = {
    lightPower: NaN,
    dampingFunction: NaN,
    shading: NaN,
    lightModel: NaN,

    lightAmbient: NaN,
    lightDiffuse: NaN,
    lightSpecular: NaN,

    lightShininess: NaN,    
}
function update() {
    sceneState.lightPower = parseFloat(document.querySelector('#lightPower').value);
    sceneState.dampingFunction = parseInt(document.querySelector('.dampingFunction').value)
    sceneState.lightShininess = 16

    sceneState.shading = parseInt(document.querySelector('.shading').value)
    sceneState.lightModel = parseInt(document.querySelector('.lightModel').value)
}
//==========================================================================================

//rotation===================================================================================================
const ROTATION_SPEED = 0.01;
let currentSpeed = 0;
let currentMode = 0;
curRotations = [0.0, 0.0, 0.0];
window.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'a' || event.key === 'ArrowLeft') // A, Left
        currentSpeed = -ROTATION_SPEED;
    else if (event.key.toLowerCase() === 'd' || event.key === 'ArrowRight') // D, Right
        currentSpeed = ROTATION_SPEED;
});
window.addEventListener('keyup', event => {
    if (event.key.toLowerCase() === 'a' || event.key === 'ArrowLeft') // A, Left
        currentSpeed = 0;
    else if (event.key.toLowerCase() === 'd' || event.key === 'ArrowRight') // D, Right
        currentSpeed = 0;
});
[...document.querySelectorAll('input[type="radio"]')].forEach(el => el.addEventListener('change', event => {
    if (event.target.checked) {
        currentMode = Number(event.target.value);
    }
}));
const rotateEachCube = (obj, Matrix, rad) => obj.rotate(Matrix, rad, [0, 1, 0]);
const rotatePedestalAroundSelfCenter = (obj, Matrix, rad) => {
    obj.rotateAround(Matrix, rad, [0, 0, -10]);
}
const rotatePedestalAroundWorldCenter = (obj, Matrix, rad) => {
    obj.rotateAround(Matrix, rad, [0, 0, 0]);
}
const transformFunctions = [
    rotateEachCube,
    rotatePedestalAroundSelfCenter,
    rotatePedestalAroundWorldCenter,
];//=========================================================================================================

class Scene {
    constructor(webgl_context, vertex_shader, fragment_shader, store) {
        this.gl = webgl_context;

        this.state = store;
        const shaderProgram = this.initShadersProgram(vertex_shader, fragment_shader);
        this.programInfo = {
            program: shaderProgram,
            attribLocations: {
                vertexPosition: this.gl.getAttribLocation(shaderProgram, 'aVertexPosition'),textureCoord: this.gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
                textureCoord: this.gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
                normal: this.gl.getAttribLocation(shaderProgram, 'aNormal'),
            },
            uniformLocations: {
                projectionMatrix: this.gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
                modelViewMatrix: this.gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),

                sampler: this.gl.getUniformLocation(shaderProgram, 'uSampler'),
                stepSize: this.gl.getUniformLocation(shaderProgram, 'uStepSize'),

                lightPower: this.gl.getUniformLocation(shaderProgram, 'uLightPower'),
                lightDirection: this.gl.getUniformLocation(shaderProgram, 'ulightDirection'),
                lightAmbient: this.gl.getUniformLocation(shaderProgram, 'uLightAmbient'),
                lightDiffuse: this.gl.getUniformLocation(shaderProgram, 'uLightDiffuse'),
                lightSpecular: this.gl.getUniformLocation(shaderProgram, 'uLightSpecular'),
                dampingFunction: this.gl.getUniformLocation(shaderProgram, 'uDampingFunction'),

                viewPosition: this.gl.getUniformLocation(shaderProgram, 'uViewPosition'),
                lightModel: this.gl.getUniformLocation(shaderProgram, 'uLightModel'),
                shading: this.gl.getUniformLocation(shaderProgram, 'uShading'),
                
                lightShininess: this.gl.getUniformLocation(shaderProgram, 'uLightShininess'),
            }
        }
        this.objects = [];
        this.then = 0;
        this.fieldOfView = 45 * Math.PI / 180;
        this.aspect = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
        this.zNear = 0.1;
        this.zFar = 100.0;
    }

    start() {
        const textureMap = loadTexture(this.gl, imageMap.src);
        const textureKatarina = loadTexture(this.gl, imageMap.src);
        const render = () => {
            this.drawScene([textureMap ]);
            requestAnimationFrame(render);
        }
        requestAnimationFrame(render);
    }

    drawScene(textures) {
        this.gl.clearColor(0.067, 0.38, 0.098, 1.0);
        this.gl.clearDepth(1.0);
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        const projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, this.fieldOfView, this.aspect, this.zNear, this.zFar);
        if(isLoading)
        {
            console.log("Loading models from obj");
            this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
        }
        else
        {
            this.objects = [ //constructor(moving, gl, scale, center, pos, tex, norm, pos_ind, tex_ind, norm_ind)
                new Object(true, this.gl, 3, [0, 0, -13], pos, tex, norm, pos_ind, tex_ind, norm_ind), //Sphere
                //new Object(true, this.gl, 1.5, [0, -4, -13], pos, tex, norm, pos_ind, tex_ind, norm_ind), //Katarina
            ];
            let i = 0;
            this.objects.forEach(obj => {
                var modelViewMatrix = mat4.create();
                obj.toPosition(modelViewMatrix);
                rotatePedestalAroundWorldCenter(obj, modelViewMatrix, curRotations[2]);
                rotatePedestalAroundSelfCenter(obj, modelViewMatrix, curRotations[1]);
                rotateEachCube(obj, modelViewMatrix, curRotations[0]);
                
                obj.setVertexes(this.programInfo);
                
                // Указываем WebGL, что мы используем текстурный регистр 1
                this.gl.activeTexture(this.gl.TEXTURE0);
                // Связываем текстуру с регистром
                this.gl.bindTexture(this.gl.TEXTURE_2D, textures[i]);

                const buffers = obj.getBuffers();
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffers.full);
                this.gl.useProgram(this.programInfo.program);
                this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
                this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);

                this.gl.uniform1i(this.programInfo.uniformLocations.sampler, 0);
                this.gl.uniform1i(this.programInfo.uniformLocations.stepSize, stepSize);

                this.gl.uniform1f(this.programInfo.uniformLocations.lightPower, this.state.lightPower);
                this.gl.uniform3fv(this.programInfo.uniformLocations.lightDirection, [0,-3,-6]);
                this.gl.uniform1i(this.programInfo.uniformLocations.dampingFunction, this.state.dampingFunction);
                this.gl.uniform3fv(this.programInfo.uniformLocations.viewPosition, [0, 0, 10]);
                this.gl.uniform1i(this.programInfo.uniformLocations.lightModel, this.state.lightModel);
                this.gl.uniform1i(this.programInfo.uniformLocations.shading, this.state.shading);
                this.gl.uniform1f(this.programInfo.uniformLocations.lightShininess, this.state.lightShininess);
                
                this.gl.drawArrays(this.gl.TRIANGLES, 0, buffers.full_vertex_count);
                i++;
            });
            curRotations[currentMode] += currentSpeed;
        }
    }

    initShadersProgram(vertexShaderCode, fragmentShaderCode) {
        const vertexShader = this.loadShader(this.gl, this.gl.VERTEX_SHADER, vertexShaderCode);
        const fragmentShader = this.loadShader(this.gl, this.gl.FRAGMENT_SHADER, fragmentShaderCode);
        const shaderProgram = this.gl.createProgram();
        this.gl.attachShader(shaderProgram, vertexShader);
        this.gl.attachShader(shaderProgram, fragmentShader);
        this.gl.linkProgram(shaderProgram);
        if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
            alert('Unable to initialize the shader program: ' + this.gl.getProgramInfoLog(shaderProgram));
            return null;
        }
        return shaderProgram;
    }
    loadShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }
}


//=================================================================================================================================

// У WebGL1 разные требования к изображениям, имеющим размер степени 2 и к не имеющим размер степени 2
function isPowerOf2(value) {
    return (value & (value - 1)) === 0;
}

function loadTexture(gl, url) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([0, 0, 255, 255]);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, pixel);
    const image = new Image();
    image.onload = function () {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // указываем как текстура должна позиционироваться. Так, в данном случае
        // передаем в качестве параметра значение gl.UNPACK_FLIP_Y_WEBGL - этот параметр указывает методу
        // gl.texImage2D(), что изображение надо перевернуть относительно горизонтальной оси.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);
        
        stepSize = (1.0 / (image.width));
        console.log(stepSize);

        if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
            // Размер соответствует степени 2
            gl.generateMipmap(gl.TEXTURE_2D);
        } else {
            // устанавливаем натяжение по краям
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }
    };
    image.crossOrigin = "anonymous"
    image.src = url;
    return texture;
}

const imageMap = document.getElementById("texMap");
const imageKatarina = document.getElementById("texKatarina");
let stepSize;
//console.log(stepSize);

//Mark42=================================================================================================================================
let isLoading = true;
let pos = [];
let tex = [];
let norm = [];
let pos_ind = [];
let tex_ind = [];
let norm_ind = [];

function main() {
    fetch('./obj_models/Sphere.obj') //Mark42 cube Sphere Katarina
        .then(response => response.text())
        .then(data => {
            //console.log(data);
            const lines = data.split('\n').join('\r').split('\r');
            let splitLine = [];
            lines.forEach(function(line) {
                //console.log(line);
                splitLine = line.split(' ');
                switch(splitLine[0]) {                    
                case 'vn':
                    norm.push(parseFloat(splitLine[1]));
                    norm.push(parseFloat(splitLine[2]));
                    norm.push(parseFloat(splitLine[3]));
                    break
                case 'vt':
                    tex.push(parseFloat(splitLine[1]));
                    tex.push(parseFloat(splitLine[2]));
                    break
                case 'v':
                    pos.push(parseFloat(splitLine[1]));
                    pos.push(parseFloat(splitLine[2]));
                    pos.push(parseFloat(splitLine[3]));
                    break
                case 'f':
                    pos_ind.push(parseFloat(splitLine[1].split("/")[0])-1);
                    pos_ind.push(parseFloat(splitLine[2].split("/")[0])-1);
                    pos_ind.push(parseFloat(splitLine[3].split("/")[0])-1);

                    tex_ind.push(parseFloat(splitLine[1].split("/")[1])-1);
                    tex_ind.push(parseFloat(splitLine[2].split("/")[1])-1);
                    tex_ind.push(parseFloat(splitLine[3].split("/")[1])-1);

                    norm_ind.push(parseFloat(splitLine[1].split("/")[2])-1);
                    norm_ind.push(parseFloat(splitLine[2].split("/")[2])-1);
                    norm_ind.push(parseFloat(splitLine[3].split("/")[2])-1);
                    break
                default:
                    break
                }
            });
        })
        .finally(function () {
            isLoading = false;
            console.log("Model Mark42 parsing finished");   
        });
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
        alert('Unable to initialize WebGL. Your browser or machine may not support it.');
        return;
    }
    new Scene(gl, cubeVertexShader, cubeFragmentShader, sceneState).start();
}
update();
main();
