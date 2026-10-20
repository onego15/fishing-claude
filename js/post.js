/* Lumina Mere — HD-2D compositor
 * Takes the low-resolution pixel layers (back / mid / fore / glow) and builds
 * the final high-resolution frame on the GPU: sharp pixel upscaling, depth of
 * field, per-layer parallax zoom, bloom & light-mapping, volumetric fog, god
 * rays and colour grading. Falls back to a plain 2D composite without WebGL2.
 */
'use strict';

(function (LM) {
  const VS = `#version 300 es
  in vec2 aPos; out vec2 vUv;
  void main(){ vUv = vec2(aPos.x*0.5+0.5, 0.5-aPos.y*0.5); gl_Position = vec4(aPos,0.0,1.0); }`;

  const FS = `#version 300 es
  precision highp float;
  in vec2 vUv; out vec4 outCol;
  uniform sampler2D uBack, uMid, uFg, uGlow;
  uniform vec2 uTex, uRes, uCenter, uSun, uMoon;
  uniform float uGrain, uTime, uFocus, uZoom, uHorizon, uFog, uNight, uSunny, uRain, uFlash, uFade, uSat, uSky, uBlurScale, uLightning, uDofMid;
  uniform vec3 uAmb, uFogCol, uSunCol;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }

  // pixel-art friendly "sharp bilinear" sampling
  vec4 sharpS(sampler2D t, vec2 uv){
    vec2 px = uv*uTex; vec2 seam = floor(px+0.5);
    vec2 d = max(fwidth(px), vec2(1e-4));
    px = seam + clamp((px-seam)/d, -0.5, 0.5);
    return textureLod(t, px/uTex, 0.0);
  }
  // variable-radius disc blur (radius in source texels), golden-angle spiral
  vec4 blurS(sampler2D t, vec2 uv, float r){
    vec4 s = sharpS(t, uv);
    if (r < 0.3) return s;
    float lod = max(0.0, log2(r) - 0.9);
    vec4 acc = textureLod(t, uv, lod); float tot = 1.0;
    for (int i=0;i<12;i++){
      float fi = float(i)+0.5; float rr = sqrt(fi/12.0)*r; float a = fi*2.39996;
      acc += textureLod(t, uv + vec2(cos(a),sin(a))*rr/uTex, lod); tot += 1.0;
    }
    return mix(s, acc/tot, clamp(r/1.1, 0.0, 1.0));
  }
  vec2 zoomUv(vec2 uv, float z){ return uCenter + (uv - uCenter)/z; }
  float coc(float y){
    float zf = 1.0/max(uFocus - uHorizon + 3.0, 1.0);
    if (y < uHorizon - 1.0) return uSky;
    float z = 1.0/max(y - uHorizon + 3.0, 1.0);
    return clamp(pow(abs(z - zf)*9.0, 0.75)*2.4, 0.0, 2.8);
  }

  void main(){
    vec2 uv = vUv;
    float zb = 1.0 + (uZoom-1.0)*0.82, zm = uZoom, zf = 1.0 + (uZoom-1.0)*1.35;
    vec2 ub = zoomUv(uv, zb), um = zoomUv(uv, zm), uf = zoomUv(uv, zf);
    // gentle parallax drift of the foreground
    uf.x += sin(uTime*0.21)*0.002;

    // --- back layer with depth of field
    float yb = ub.y*uTex.y;
    vec4 back = blurS(uBack, ub, coc(yb)*uBlurScale);
    // light from glow map affects the world a little
    vec3 lightMap = textureLod(uGlow, um, 2.6).rgb;
    vec3 col = back.rgb * (1.0 + lightMap*0.5);

    // atmospheric haze + volumetric fog near the horizon and over water
    float fy = yb;
    float band = exp(-pow((fy - uHorizon)/ (18.0 + uFog*30.0), 2.0));
    float low = smoothstep(uHorizon-4.0, uTex.y, fy) * 0.55;
    vec2 fp = vec2(ub.x*5.0 + uTime*0.035, fy*0.06 - uTime*0.01);
    float n = fbm(fp*vec2(1.0, 2.6)) ;
    float n2 = fbm(fp*vec2(2.3, 4.0) + vec2(-uTime*0.05, 3.1));
    float fogAmt = (0.22 + uFog*0.75) * band * (0.55 + n*0.8) + uFog*low*(n2*0.9);
    col = mix(col, uFogCol, clamp(fogAmt, 0.0, 0.92));

    // --- mid layer (characters / props), mostly in focus
    float midR = uDofMid*uBlurScale;
    vec4 mid = blurS(uMid, um, midR);
    vec3 midLit = mid.rgb * (uAmb + lightMap*0.85);
    col = midLit + col*(1.0 - mid.a);

    // fog drifting in front of the mid layer
    float ym = um.y*uTex.y;
    float fogFront = uFog * (0.12 + 0.35*smoothstep(0.3, 1.0, fbm(vec2(um.x*3.5 - uTime*0.06, ym*0.05 + uTime*0.02)))) * smoothstep(uHorizon, uTex.y, ym);
    col = mix(col, uFogCol, fogFront);

    // --- foreground, strongly defocused
    vec4 fg = blurS(uFg, uf, 3.4*uBlurScale);
    col = fg.rgb * (uAmb*0.9 + lightMap) + col*(1.0 - fg.a);

    // --- bloom from the emissive layer
    vec3 g0 = textureLod(uGlow, um, 0.0).rgb;
    vec3 g1 = textureLod(uGlow, um, 1.5).rgb;
    vec3 g2 = textureLod(uGlow, um, 3.0).rgb;
    vec3 g3 = textureLod(uGlow, um, 4.3).rgb;
    col += g0*0.55 + g1*0.55 + g2*0.6 + g3*0.55;

    // --- god rays from the sun (and a faint moon halo)
    if (uSunny > 0.01) {
      vec2 d = (uv - uSun) * vec2(uRes.x/uRes.y, 1.0);
      float ang = atan(d.y, d.x);
      float len = length(d);
      float rays = pow(vnoise(vec2(ang*9.0, uTime*0.12)), 3.0) * 0.8 + pow(vnoise(vec2(ang*23.0+4.0, -uTime*0.07)),4.0)*0.6;
      float fall = exp(-len*2.4) * smoothstep(0.0, 0.08, len);
      col += uSunCol * rays * fall * uSunny * 0.36;
      col += uSunCol * exp(-len*7.0) * uSunny * 0.3;
    }
    {
      vec2 d = (uv - uMoon) * vec2(uRes.x/uRes.y, 1.0);
      col += vec3(0.55,0.62,1.0) * exp(-length(d)*9.0) * uNight * 0.28;
    }

    // --- grading
    float l = dot(col, vec3(0.299,0.587,0.114));
    col = mix(vec3(l), col, uSat);
    col = col*(1.0 + uLightning*0.9) + vec3(0.6,0.7,1.0)*uLightning*0.25;
    // filmic shoulder so bright bloom rolls off instead of clipping
    col = col / (1.0 + max(col - 0.8, 0.0) * 0.9);
    col = clamp(col, 0.0, 1.0);
    col = mix(col, col*col*(3.0-2.0*col), 0.22); // soft contrast
    // night: cool shadows; day: warm highlights
    col = mix(col, col*vec3(0.92,0.96,1.08), uNight*0.5);
    // vignette
    vec2 vv = (uv-0.5)*vec2(1.0, 1.1);
    col *= 1.0 - pow(length(vv)*1.18, 2.6)*0.6;
    // grain
    col += (hash(uv*uRes + fract(uTime*7.0)*100.0)-0.5)*0.018*uGrain;
    col = mix(col, vec3(1.0), uFlash);
    col *= 1.0 - uFade;
    outCol = vec4(col, 1.0);
  }`;

  function Post(canvas) {
    this.canvas = canvas;
    this.uniforms = {};
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.gl = gl;
    if (!gl) {
      this.fallback = canvas.getContext('2d');
      return;
    }
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = {};
    ['uBack', 'uMid', 'uFg', 'uGlow'].forEach((name, i) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(prog, name), i);
      this.tex[name] = { t, unit: i };
    });
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      this.uniforms[info.name] = gl.getUniformLocation(prog, info.name);
    }
  }

  Post.prototype.upload = function (name, src) {
    const gl = this.gl;
    const t = this.tex[name];
    gl.activeTexture(gl.TEXTURE0 + t.unit);
    gl.bindTexture(gl.TEXTURE_2D, t.t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  Post.prototype.render = function (layers, u) {
    const cw = this.canvas.width, ch = this.canvas.height;
    if (!this.gl) return this.render2D(layers, u);
    const gl = this.gl;
    gl.viewport(0, 0, cw, ch);
    this.upload('uBack', layers.back);
    this.upload('uMid', layers.mid);
    this.upload('uFg', layers.fg);
    this.upload('uGlow', layers.glow);
    const U = this.uniforms;
    const f1 = (k, v) => U[k] && gl.uniform1f(U[k], v);
    const f2 = (k, a, b) => U[k] && gl.uniform2f(U[k], a, b);
    const f3 = (k, c) => U[k] && gl.uniform3f(U[k], c[0], c[1], c[2]);
    f2('uTex', LM.W, LM.H);
    f2('uRes', cw, ch);
    f2('uCenter', u.cx, u.cy);
    f2('uSun', u.sun[0], u.sun[1]);
    f2('uMoon', u.moon[0], u.moon[1]);
    f1('uGrain', u.grain === undefined ? 1 : u.grain); f1('uTime', u.time); f1('uFocus', u.focus); f1('uZoom', u.zoom); f1('uHorizon', LM.HORIZON);
    f1('uFog', u.fog); f1('uNight', u.night); f1('uSunny', u.sunny); f1('uRain', u.rain);
    f1('uFlash', u.flash); f1('uFade', u.fade); f1('uSat', u.sat); f1('uSky', u.sky);
    f1('uBlurScale', u.blurScale); f1('uLightning', u.lightning); f1('uDofMid', u.dofMid);
    f3('uAmb', u.amb); f3('uFogCol', u.fogCol); f3('uSunCol', u.sunCol);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Minimal fallback: crisp upscale + additive glow
  Post.prototype.render2D = function (layers, u) {
    const ctx = this.fallback, cw = this.canvas.width, ch = this.canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    const z = u.zoom;
    ctx.translate(cw * u.cx, ch * u.cy);
    ctx.scale(z, z);
    ctx.translate(-cw * u.cx, -ch * u.cy);
    ctx.drawImage(layers.back, 0, 0, cw, ch);
    ctx.drawImage(layers.mid, 0, 0, cw, ch);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(layers.fg, 0, 0, cw, ch);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(layers.glow, 0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (u.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${u.fade})`; ctx.fillRect(0, 0, cw, ch); }
    if (u.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${u.flash})`; ctx.fillRect(0, 0, cw, ch); }
  };

  LM.Post = Post;
})(window.LM);
