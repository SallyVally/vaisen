import { assetUrl } from "./asset-paths.js";
import { readAssetJson } from "./asset-paths.js";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { createAtmosphere } from "./tower-environment.js";
import { applyPresentationCamera } from "./tower-presentation.js";
import { createCoreEmitter, createPortraitEnvironment, createPortraitLandscape, createPortraitMaterials, createWetSurface, framePortrait, PORTRAIT_BOUNDS } from "./tower-lookdev.js";
import { loadPortraitTower, loadPortraitModule } from "./tower-portrait-model.js";
import { updatePortraitMist } from "./tower-atmosphere-motion.js";
import { CGI_RELEASE, bindSupportedCGI, supportedCGIPose, frameCGIInspection, frameCGIRelease, supportedCGICamera } from "./tower-supported-mechanism.js";
import { TowerSectorNavigation, bindSupportedMusic, bindSupportedSmartLight, bindSupportedWeb, applySectorMechanics, applyParallelSectorMechanics, mirrorPortraitCamera, mirrorSmartCamera, mirrorWebCamera, frameMusicInspection, frameSmartInspection, frameWebInspection, sectorMechanicalPose, sectorMechanicalCamera, orbitPortraitCamera, reflectMechanicalSteam, sectorFromHash, isRightSector } from "./tower-sector-navigation.js";
import { MechanicalSteam } from "./tower-mechanical-steam.js";
import { createTowerActuators } from "./tower-actuators.js";
import { applyTowerStudio } from "./cgi-studio-variant.js";
import { applyMusicStudy } from "./music-studio-variant.js";
import { createPortraitLighting, PORTRAIT_LIGHTING } from "./tower-portrait-lighting.js";
import { SmartLightingBlend } from "./smart-light-room.js";
import { SmartTowerLoader, buildSmartTowerModule, replaceSmartTowerLayout, smartTowerSector } from "./smart-light-tower.js";
import { SectorAssetLoader, replaceSectorLayout } from "./sector-asset-loader.js";
import { webTowerSector } from "./web-studio.js";
import { optimizePortraitLightWork } from "./tower-light-work.js";
import { createHardwareShadow } from "./tower-hardware-shadow.js";
import { optimizeAreaTree } from "./tower-area-work.js";
import { batchPortraitModules } from "./tower-rigid-batches.js";
import { installDepthOnlyShadowPass } from "./tower-depth-only-shadow.js";
import { configureCrispShadow, reduceBakedInteriorShadows, simplifyRoughLandscapeArea } from "./tower-crisp-detail.js";
import { mobileViewport } from "./tower-mobile-quality.js";
import { sceneCommand, embeddedCamera, immersiveInsets } from "./site-scene-protocol.js";
import { A2_CARDS, applyA2Materials, createA2Landscape, configureA2Lighting, updateA2Lighting, frameA2, frameA2Release } from "./stage-a2.js";
import { STAGE_NAVIGATION_TIMING, StageFloorFocus, frameStageFloor, blendOrbitTransition, blendParallelOrbit } from "./stage-inspection.js";
import { prepareCgiInspection, prepareInspectionGlass, cgiInspectionAtmosphere } from "./cgi-inspection-art.js";
import { SiteCameraMotion } from "./site-camera-motion.js";
import { introLightPosition } from "./scene-intro.js";
import { SectorLightMood } from "./sector-light-mood.js";
import { InteriorMotion } from "./interior-motion.js";
import { portraitPixelRatio } from "./tower-capture-aa.js";
import { FirstSectorReveal, firstRevealCamera, firstRevealLight } from "./first-sector-reveal.js";
import { SceneLife } from "./scene-life.js";
import { SceneHandover } from "./scene-handover.js";
import { frameMobileTower } from "./stage-mobile-framing.js";
import { MobileSurfaceWork } from "./tower-mobile-surface.js";
import { MobileReflectionProxy } from "./tower-mobile-reflection.js";
import "./tower-portrait.css";
const canvas = document.querySelector("#portrait-scene");
const status = document.querySelector("#portrait-status");
const retry = document.querySelector("#portrait-retry");
const atmosphereToggle = document.querySelector("#portrait-atmosphere");
const reflectionToggle = document.querySelector("#portrait-reflections");
const motionToggle = document.querySelector("#portrait-motion");
const assemblyButtons = [...document.querySelectorAll("[data-assembly]")];
const assemblyCaption = document.querySelector("#assembly-caption");
const lightControls = document.querySelector("#portrait-lighting");
const lightButtons = [...document.querySelectorAll("[data-lighting]")];
const title = document.querySelector("#portrait-title");
const description = document.querySelector("#portrait-description");
const disciplines = document.querySelector("#portrait-disciplines");
const titleBlock = document.querySelector(".portrait-title");
const coreDescription = description.innerHTML;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
const embedded = new URLSearchParams(location.search).get("embedded") === "1" && window.parent !== window;
const immersive = embedded && new URLSearchParams(location.search).get("composition") === "immersive";
const stageA2 = immersive && new URLSearchParams(location.search).get("art") === "a2";
document.documentElement.classList.toggle("embedded-study", embedded);
motionToggle.checked = !reduced.matches;
let motionOverridden = false;
motionToggle.addEventListener("change", () => {
  motionOverridden = true;
});
reduced.addEventListener("change", () => {
  if (!motionOverridden) motionToggle.checked = !reduced.matches;
});
retry.addEventListener("click", () => location.reload());
const json = readAssetJson;
async function start() {
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const phoneViewport = () => mobileViewport(canvas.clientWidth, canvas.clientHeight, coarsePointer);
  const mobilePresentation = embedded && phoneViewport();
  const mobileSurface = stageA2 && mobilePresentation, analyticFog = mobileSurface, liveLayers = mobileSurface;
  const detail = mobilePresentation, batching = detail, waterFirst = mobilePresentation;
  const captureAA = mobilePresentation ? "fxaa" : stageA2 ? "hybrid" : "msaa";
  const fastCapture = captureAA === "fxaa";
  const reflectionWork = mobileSurface ? new MobileReflectionProxy() : null;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.info.autoReset = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  let shaderFailure = false, shaderFailureMessage = "";
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    shaderFailure = true;
    shaderFailureMessage ||= [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join(" / ").slice(0, 220);
    console.error("VAISEN portrait shader", gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment));
  };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(197637);
  const environment = createPortraitEnvironment(stageA2 ? A2_CARDS : void 0), pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(environment, 0.025);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = PORTRAIT_LIGHTING.environmentIntensity;
  if (stageA2) scene.environmentIntensity = 0.38;
  environment.traverse((object) => {
    if (object.isMesh) {
      object.geometry.dispose();
      object.material.dispose();
    }
  });
  pmrem.dispose();
  RectAreaLightUniformsLib.init();
  scene.add(createPortraitLighting());
  if (stageA2) configureA2Lighting(scene.getObjectByName("PORTRAIT_DRAMATIC_LIGHTING"));
  const sectorLight = stageA2 ? new SectorLightMood(scene.getObjectByName("PORTRAIT_DRAMATIC_LIGHTING")) : null;
  if (detail) configureCrispShadow(scene.getObjectByName("PORTRAIT_SCULPTING_KEY"));
  const hardwareShadow = renderer.shadowMap.enabled ? createHardwareShadow(scene.getObjectByName("PORTRAIT_SCULPTING_KEY"), { filter: detail ? "compact" : "soft" }) : null;
  const depthOnly = detail && hardwareShadow ? installDepthOnlyShadowPass(renderer, scene.getObjectByName("PORTRAIT_SCULPTING_KEY"), hardwareShadow) : null;
  const metadata = applyMusicStudy(applyTowerStudio(await json(assetUrl("/tower-showcase/tower-collections-v04.json")), await json(assetUrl("/cgi-studio/l02-studio-v01.json")), await json(assetUrl("/cgi-complete/cgi-complete-v01.json"))), await json(assetUrl("/music-studio/music-studio-v01.json")), { quality: "presentation" });
  const assets = await json(assetUrl("/tower-lookdev/portrait-assets-v01.json"));
  const textures = new Map(), textureLoader = new THREE.TextureLoader();
  function texture(url, color = true, repeat = false) {
    const key = `${url}|${color}|${repeat}`;
    if (!textures.has(key)) textures.set(key, textureLoader.loadAsync(url).then((map) => {
      map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      map.wrapS = map.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      if (repeat) map.flipY = false;
      return map;
    }).catch((error) => {
      textures.delete(key);
      throw error;
    }));
    return textures.get(key);
  }
  const maps = {};
  for (const name of ["color", "roughness", "normal", "stoneNormal"]) maps[name] = await texture(assets.maps[name].url, name === "color", true);
  const materials = createPortraitMaterials(maps);
  if (stageA2) applyA2Materials(materials, { mobile: phoneViewport() });
  const tower = await loadPortraitTower(metadata, assets, materials, texture, (loaded, total) => {
    status.value = `${loaded} / ${total}`;
  }, { interiorLook: stageA2 });
  const cgiArt = stageA2 ? prepareCgiInspection(tower) : null;
  const glassArts = stageA2 ? { music: prepareInspectionGlass(tower.getObjectByName("CLOSED_music"), "music") } : {};
  const inspectionAtmosphere = () => cgiInspectionAtmosphere(Math.max(cgiArt?.progress ?? 0, ...Object.values(glassArts).map((art) => art.progress)));
  scene.add(tower);
  const navigation = new TowerSectorNavigation(stageA2 ? STAGE_NAVIGATION_TIMING : void 0), mechanism = navigation.motion;
  const interiorMotion = new InteriorMotion();
  const floorFocus = new StageFloorFocus();
  let floorViews = {};
  const releaseFX = new MechanicalSteam();
  const cgi = metadata.sectors.find((sector) => sector.id === "cgi");
  const music = metadata.sectors.find((sector) => sector.id === "music");
  const smart = metadata.sectors.find((sector) => sector.id === "smart-light");
  const web = metadata.sectors.find((sector) => sector.id === "web");
  let lightMode = new URLSearchParams(location.search).get("light") === "evening" ? "evening" : "day";
  const lightBlend = new SmartLightingBlend(lightMode), lightUniform = { value: lightBlend.value };
  const rig = bindSupportedCGI(tower, cgi);
  const rigs = { cgi: rig, music: bindSupportedMusic(tower, rig, music) };
  const actuators = createTowerActuators(materials);
  scene.add(actuators.group);
  const parallelActuators = createTowerActuators(materials);
  parallelActuators.group.visible = false;
  scene.add(parallelActuators.group);
  let assemblyPose = supportedCGIPose(0), appliedTime = 0, appliedSide = 0, appliedSector = "cgi", appliedParallel = "";
  rig.apply(assemblyPose);
  actuators.apply(assemblyPose);
  scene.add(createCoreEmitter());
  const landscape = stageA2 ? await createA2Landscape(materials) : createPortraitLandscape(materials);
  scene.add(landscape);
  const water = createWetSurface(maps.stoneNormal, phoneViewport() ? 512 : 768, { crop: true, captureWork: reflectionWork, depthFirst: waterFirst });
  water.visible = reflectionToggle.checked;
  scene.add(water);
  const sceneLife = stageA2 ? new SceneLife(water) : null;
  if (sceneLife) scene.add(sceneLife.group);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 180);
  const cameraMotion = new SiteCameraMotion();
  let macroEntrance = null;
  let handover = null, lifeFade = -1;
  const firstReveal = new FirstSectorReveal();
  let revealLightApplied = false;
  const introLight = stageA2 ? scene.getObjectByName("PORTRAIT_CORE_AREA") : null;
  const surfaceWork = mobileSurface ? new MobileSurfaceWork(scene) : null;
  const atmosphere = createAtmosphere(renderer, { portrait: true, cacheScene: true, captureAA, analyticFog, layeredScene: liveLayers });
  let directDirty = true, mobileCapture = false;
  function invalidateScene(shadows = false) {
    atmosphere.invalidateScene();
    directDirty = true;
    water.userData.invalidate();
    if (shadows) renderer.shadowMap.needsUpdate = true;
  }
  function prepareLightWork(root) {
    if (detail) reduceBakedInteriorShadows(root);
    if (batching) batchPortraitModules(root);
    optimizePortraitLightWork(root, hardwareShadow);
    if (detail) optimizeAreaTree(root, { world: true });
    if (detail) simplifyRoughLandscapeArea(root);
    surfaceWork?.register(root);
    reflectionWork?.register(root);
  }
  const steam = Array.from({ length: 4 }, () => new THREE.Vector4());
  const header = document.querySelector(".portrait-header"), footer = document.querySelector(".portrait-footer");
  let embeddedLayout = null;
  let overview, inspection, release, rearOverview, rearInspection, rearRelease, smartOverview, smartInspection, smartRelease, webOverview, webInspection, webRelease;
  const raisedBounds = PORTRAIT_BOUNDS.clone().union(PORTRAIT_BOUNDS.clone().translate(new THREE.Vector3(...CGI_RELEASE.bodyTravel)));
  const rightRaisedBounds = PORTRAIT_BOUNDS.clone().union(PORTRAIT_BOUNDS.clone().translate(new THREE.Vector3(0, 3, -2.4)));
  const bothRaisedBounds = raisedBounds.clone().union(rightRaisedBounds);
  function updateCamera() {
    if (stageA2) {
      inspection = floorFocus.camera("cgi", floorViews.cgi);
      rearInspection = floorFocus.camera("music", floorViews.music);
      smartInspection = floorFocus.camera("smart-light", floorViews["smart-light"]);
      webInspection = floorFocus.camera("web", floorViews.web);
    }
    let pose;
    if (navigation.route) {
      const route = navigation.route, raised = route.handover && !route.crossWing;
      const views = raised ? [release, rearRelease, smartRelease, webRelease] : [overview, rearOverview, smartOverview, webOverview];
      pose = orbitPortraitCamera(views[route.from], views[route.to], route.progress, camera.aspect, route.parallel ? bothRaisedBounds : raised ? isRightSector(navigation.active) ? rightRaisedBounds : raisedBounds : PORTRAIT_BOUNDS, { crop: stageA2 && camera.aspect <= 1.15 });
      if (route.overlap || route.parallel) {
        const activeSide = navigation.active === "web" ? 3 : navigation.active === "smart-light" ? 2 : navigation.active === "music" ? 1 : 0;
        const cameraFor = (id, time2) => id === "web" ? sectorMechanicalCamera("web", webOverview, webInspection, time2, webRelease) : id === "smart-light" ? sectorMechanicalCamera("smart-light", smartOverview, smartInspection, time2, smartRelease) : id === "music" ? supportedCGICamera(rearOverview, rearInspection, time2, rearRelease) : supportedCGICamera(overview, inspection, time2, release);
        const current = cameraFor(navigation.active, mechanism.time);
        pose = route.parallel ? blendParallelOrbit(current, pose, cameraFor(route.parallel.sector, route.parallel.motion.time), route) : blendOrbitTransition(current, pose, route, activeSide);
      }
    } else if (navigation.side === 3) pose = sectorMechanicalCamera("web", webOverview, webInspection, mechanism.time, webRelease);
    else if (navigation.side === 2) pose = sectorMechanicalCamera("smart-light", smartOverview, smartInspection, mechanism.time, smartRelease);
    else pose = navigation.side === 1 ? supportedCGICamera(rearOverview, rearInspection, mechanism.time, rearRelease) : supportedCGICamera(overview, inspection, mechanism.time, release);
    pose = firstRevealCamera(pose, reduced.matches ? 0 : firstReveal.weight);
    const presented = embedded && !immersive ? embeddedCamera(pose) : pose;
    const smooth = stageA2 && motionToggle.checked;
    cameraMotion.set(presented, !smooth);
    applyPresentationCamera(camera, cameraMotion.pose);
    if (stageA2) updateA2Lighting(scene, assemblyPose.cameraMix);
    cgiArt?.update(navigation.active === "cgi" && !navigation.route ? assemblyPose.cameraMix : 0);
    for (const [sector, art] of Object.entries(glassArts)) art.update(navigation.active === sector && !navigation.route ? assemblyPose.cameraMix : 0);
  }
  function resize() {
    if (handover) {
      handover.dispose();
      handover = null;
    }
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    const cinematic = stageA2 && !mobileViewport(width, height, coarsePointer) && width / height > 1.15;
    atmosphere.setCinematic(cinematic);
    cgiArt?.setCinematic(cinematic);
    const insets = immersive ? immersiveInsets(width, height, embeddedLayout) : { header: header.offsetHeight, footer: footer.offsetHeight };
    mobileCapture = mobileViewport(width, height, coarsePointer);
    atmosphere.setOpaqueTop(immersive && mobileCapture ? (embeddedLayout?.opaqueTop ?? 0) / height : 0);
    renderer.setPixelRatio(portraitPixelRatio(width, height, window.devicePixelRatio, { presentation: stageA2, mobile: mobileCapture }));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    overview = (stageA2 ? frameA2 : framePortrait)(width, height, insets.header, insets.footer);
    inspection = frameCGIInspection(cgi, width, height, insets.header, insets.footer);
    release = (stageA2 ? frameA2Release : frameCGIRelease)(width, height, insets.header, insets.footer);
    if (stageA2 && width / height <= 1.15) {
      overview = frameMobileTower(width, height, insets.footer);
      release = overview;
    }
    rearOverview = mirrorPortraitCamera(overview);
    rearRelease = mirrorPortraitCamera(release);
    rearInspection = frameMusicInspection(music, width, height, insets.header, insets.footer);
    smartOverview = mirrorSmartCamera(overview);
    smartRelease = mirrorSmartCamera(release);
    smartInspection = frameSmartInspection(smart, width, height, insets.header, insets.footer);
    webOverview = mirrorWebCamera(overview);
    webRelease = mirrorWebCamera(release);
    webInspection = frameWebInspection(web, width, height, insets.header, insets.footer);
    if (stageA2) floorViews = Object.fromEntries([cgi, music, smart, web].map((sector) => [sector.id, [0, 1, 2].map((floor) => frameStageFloor(sector, floor, width, height, insets.header, insets.footer))]));
    updateCamera();
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    atmosphere.resize(size.x, size.y);
    invalidateScene();
  }
  new ResizeObserver(resize).observe(canvas);
  new ResizeObserver(resize).observe(footer);
  resize();
  reflectionToggle.addEventListener("change", () => {
    water.visible = reflectionToggle.checked;
    invalidateScene();
  });
  atmosphereToggle.addEventListener("change", () => invalidateScene());
  const smartLoader = new SmartTowerLoader(async () => {
    const [study, structure] = await Promise.all([json(assetUrl("/smart-light/smart-light-v01.json")), json(assetUrl("/smart-light-tower/integration-v01.json"))]);
    const sector = smartTowerSector(smart, study, structure);
    const module = await buildSmartTowerModule(sector, study, materials, texture, lightUniform);
    if (stageA2) glassArts["smart-light"] = prepareInspectionGlass(module, "smart-light");
    prepareLightWork(module);
    await renderer.compileAsync(module, camera, scene);
    if (shaderFailure) throw new Error("Smart Light shader warm-up failed");
    return { study, sector, module };
  }, ({ sector, module }) => {
    replaceSmartTowerLayout(tower, module, materials);
    rigs["smart-light"] = bindSupportedSmartLight(tower, sector);
    invalidateScene(true);
  });
  const webLoader = new SectorAssetLoader(async () => {
    const study = await json(assetUrl("/web-studio/web-studio-v01.json")), sector = webTowerSector(web, study);
    const module = await loadPortraitModule(sector, null, materials, texture, { interiorLook: stageA2 });
    if (stageA2) glassArts.web = prepareInspectionGlass(module, "web");
    prepareLightWork(module);
    await renderer.compileAsync(module, camera, scene);
    if (shaderFailure) throw new Error("Web shader warm-up failed");
    return { sector, module };
  }, ({ sector, module }) => {
    replaceSectorLayout(tower, module, materials);
    rigs.web = bindSupportedWeb(tower, sector);
    invalidateScene(true);
  });
  let selectionToken = 0, loadingSector = null, selectionError = "";
  function lightState() {
    for (const button of lightButtons) button.setAttribute("aria-pressed", String(button.dataset.lighting === lightMode));
  }
  lightState();
  for (const button of lightButtons) button.addEventListener("click", () => {
    lightMode = button.dataset.lighting;
    lightBlend.request(lightMode, { immediate: reduced.matches });
    lightState();
    const url = new URL(location.href);
    if (lightMode === "evening") url.searchParams.set("light", lightMode);
    else url.searchParams.delete("light");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) lightBlend.request(lightMode, { immediate: true });
  });
  async function selectAssembly(sector) {
    if (handover) {
      handover.dispose();
      handover = null;
    }
    firstReveal.select(sector, { enabled: stageA2 && motionToggle.checked && !phoneViewport() && camera.aspect > 1.15, fromCore: navigation.requested === "core" && !navigation.route && mechanism.time === 0 });
    const token = ++selectionToken;
    loadingSector = null;
    selectionError = "";
    sectorLight?.request(sector);
    lightControls.hidden = sector !== "smart-light";
    const selectedLoader = sector === "web" ? webLoader : smartLoader;
    if ((sector === "smart-light" || sector === "web") && !selectedLoader.value) {
      loadingSector = sector === "web" ? "Web / Loading" : "Smart light / Loading";
      if (stageA2 && motionToggle.checked) navigation.request(sector, { ready: false });
      try {
        await selectedLoader.load();
        if (sector === "smart-light") for (const button of lightButtons) button.disabled = false;
      } catch (error) {
        if (token !== selectionToken) return;
        sectorLight?.request(navigation.active);
        if (stageA2 && motionToggle.checked) navigation.request(navigation.active);
        console.error(error);
        loadingSector = null;
        selectionError = sector === "web" ? "Web unavailable" : "Smart light unavailable";
        retry.hidden = false;
        lightControls.hidden = true;
        return;
      }
    }
    if (token !== selectionToken) return;
    loadingSector = null;
    retry.hidden = true;
    const immediate = reduced.matches && !motionToggle.checked;
    navigation.request(sector, { immediate });
    if (immediate) releaseFX.reset();
    for (const button of assemblyButtons) button.setAttribute("aria-pressed", String(button.dataset.assembly === sector));
    history.replaceState(null, "", location.pathname + location.search + (sector === "core" ? "" : `#${sector}-release`));
  }
  function settleReducedMotion() {
    if (reduced.matches && !motionToggle.checked) {
      stopMacro(true);
      navigation.request(navigation.requested, { immediate: true });
      releaseFX.reset();
    }
  }
  reduced.addEventListener("change", settleReducedMotion);
  motionToggle.addEventListener("change", settleReducedMotion);
  window.addEventListener("hashchange", () => selectAssembly(sectorFromHash(location.hash)));
  if (stageA2 && new URLSearchParams(location.search).get("intro") === "cinematic") {
    try {
      const { MacroEntrance } = await import("./macro-entrance.js");
      macroEntrance = new MacroEntrance({ renderer, mainScene: scene, tower, landscape, materials, maps, farPose: () => overview, atmosphereStrength: inspectionAtmosphere, mobile: mobilePresentation, publish: (state) => window.parent.postMessage({ type: "vaisen-scene-intro-state", ...state }, location.origin) });
    } catch (error) {
      console.warn("VAISEN introduction unavailable", error);
    }
  }
  function restoreMacro() {
    camera.near = 0.1;
    atmosphere.setMacroWeight(1);
    cameraMotion.set(overview, true);
    updateCamera();
    if (sceneLife) {
      sceneLife.setVisibility(0);
      lifeFade = 0;
    }
    invalidateScene(true);
  }
  function stopMacro(immediate = false) {
    if (!macroEntrance || macroEntrance.disposed) return;
    macroEntrance.skip(immediate);
    if (macroEntrance.disposed) restoreMacro();
  }
  prepareLightWork(scene);
  await renderer.compileAsync(scene, camera);
  if (reflectionWork) await reflectionWork.prepare(renderer, scene, camera);
  if (fastCapture || captureAA === "hybrid") await atmosphere.prepareCaptureAA();
  updatePortraitMist(0, steam);
  if (atmosphereToggle.checked) atmosphere.render(scene, camera, 0, steam, stageA2 ? inspectionAtmosphere() : 1);
  else renderer.render(scene, camera);
  if (shaderFailure) throw new Error("Portrait shader warm-up failed: " + shaderFailureMessage);
  if (macroEntrance) {
    try {
      await macroEntrance.prepare(camera, atmosphere, steam);
      if (shaderFailure) throw new Error(shaderFailureMessage);
    } catch (error) {
      macroEntrance.release();
      macroEntrance = null;
      shaderFailure = false;
      shaderFailureMessage = "";
      console.warn("VAISEN introduction unavailable", error);
    }
  }
  for (const button of assemblyButtons) {
    button.disabled = false;
    button.addEventListener("click", () => selectAssembly(button.dataset.assembly));
  }
  if (sectorFromHash(location.hash) !== "core") selectAssembly(sectorFromHash(location.hash));
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    renderer.setAnimationLoop(null);
    status.dataset.ready = "false";
    status.value = "Graphics unavailable";
    status.setAttribute("role", "alert");
    retry.hidden = false;
    if (embedded) window.parent.postMessage({ type: "vaisen-scene-error" }, location.origin);
  });
  status.value = "Core online";
  status.dataset.ready = "true";
  let embeddedVisible = true;
  if (embedded) {
    window.addEventListener("message", (event) => {
      const command = sceneCommand(event, window.parent, location.origin);
      if (!command) return;
      if (command.sector) {
        stopMacro();
        selectAssembly(command.sector);
      }
      if (command.visible !== void 0) {
        embeddedVisible = command.visible;
        if (!embeddedVisible) {
          stopMacro(true);
          invalidateScene();
        }
      }
      if (command.motion !== void 0) {
        motionToggle.checked = command.motion;
        motionToggle.dispatchEvent(new Event("change"));
      }
      if (command.audio) interiorMotion.setAudio(command.audio);
      if (command.intro === "start" && motionToggle.checked && navigation.requested === "core") macroEntrance?.start();
      if (command.intro === "skip") stopMacro(command.introImmediate);
      if (stageA2 && command.focus) {
        floorFocus.request(command.focus.sector, command.focus.floor, reduced.matches && !motionToggle.checked);
        updateCamera();
        invalidateScene();
      }
      if (command.layout) {
        embeddedLayout = command.layout;
        resize();
      }
    });
    window.parent.postMessage({ type: "vaisen-scene-ready", motion: motionToggle.checked, intro: Boolean(macroEntrance && !macroEntrance.disposed) }, location.origin);
  }
  let lastTime = 0, time = 0;
  let lastStatus = "";
  let currentStory = "core";
  document.addEventListener("visibilitychange", () => {
    lastTime = 0;
  });
  renderer.setAnimationLoop((milliseconds) => {
    if (embedded && !embeddedVisible) {
      lastTime = 0;
      return;
    }
    const dt = lastTime === 0 ? 0 : Math.min(0.5, Math.max(0, (milliseconds - lastTime) / 1e3));
    lastTime = milliseconds;
    if (document.hidden) return;
    renderer.info.reset();
    if (macroEntrance?.active) {
      const finished = macroEntrance.tick(dt);
      macroEntrance.render(camera, atmosphere, steam);
      if (finished) {
        handover = new SceneHandover(renderer, mobilePresentation ? 1.45 : 1.15);
        macroEntrance.release();
        restoreMacro();
      }
      return;
    }
    navigation.tick(dt);
    const revealChanged = firstReveal.tick(dt, { active: navigation.active, requested: navigation.requested, time: mechanism.time, route: Boolean(navigation.route), enabled: stageA2 && motionToggle.checked && !phoneViewport() && camera.aspect > 1.15 });
    const focusChanged = stageA2 && floorFocus.tick(dt);
    if (navigation.active !== appliedSector) releaseFX.reset();
    const cues = navigation.consumeCues().filter((cue) => cue.sector === navigation.active);
    releaseFX.update(dt, cues);
    if (navigation.active !== "cgi") reflectMechanicalSteam(releaseFX, isRightSector(navigation.active), navigation.active !== "web");
    const parallel = navigation.route?.parallel, parallelKey = parallel ? `${parallel.sector}/${parallel.motion.time}` : "";
    if (mechanism.time !== appliedTime || navigation.side !== appliedSide || navigation.active !== appliedSector || parallelKey !== appliedParallel) {
      const nextPose = sectorMechanicalPose(navigation.active, mechanism.time);
      const geometryChanged = parallelKey !== appliedParallel || navigation.active !== appliedSector || !assemblyPose.bodyOffset.equals(nextPose.bodyOffset) || !assemblyPose.moduleOffset.equals(nextPose.moduleOffset);
      assemblyPose = nextPose;
      if (parallel) {
        applyParallelSectorMechanics(rigs, navigation.active, assemblyPose, parallel.sector, sectorMechanicalPose(parallel.sector, parallel.motion.time));
        parallelActuators.group.scale.set(parallel.sector === "cgi" || parallel.sector === "web" ? 1 : -1, 1, isRightSector(parallel.sector) ? -1 : 1);
        parallelActuators.apply(supportedCGIPose(parallel.motion.time));
      } else applySectorMechanics(rigs, navigation.active, assemblyPose);
      parallelActuators.group.visible = Boolean(parallel);
      actuators.group.scale.set(navigation.active === "cgi" || navigation.active === "web" ? 1 : -1, 1, isRightSector(navigation.active) ? -1 : 1);
      actuators.apply(supportedCGIPose(mechanism.time));
      updateCamera();
      appliedTime = mechanism.time;
      appliedSide = navigation.side;
      appliedSector = navigation.active;
      appliedParallel = parallelKey;
      invalidateScene(geometryChanged);
    }
    if (focusChanged || revealChanged) {
      updateCamera();
      invalidateScene();
    }
    const cameraChanged = cameraMotion.tick(dt);
    if (cameraChanged) {
      applyPresentationCamera(camera, cameraMotion.pose);
      invalidateScene();
    }
    if (sectorLight?.tick(dt, { inspection: assemblyPose.cameraMix, strength: mobileCapture ? 0 : 1 })) {
      atmosphere.setMoodTint(sectorLight.tint);
      invalidateScene();
    }
    let fadeChanged = false;
    if (sceneLife && lifeFade >= 0 && lifeFade < 3) {
      lifeFade = Math.min(3, lifeFade + dt);
      const t = lifeFade / 3;
      sceneLife.setVisibility(t * t * (3 - 2 * t));
      fadeChanged = true;
    }
    const lifeStrength = lifeFade < 0 ? 1 : Math.min(1, lifeFade / 3) ** 2 * (3 - 2 * Math.min(1, lifeFade / 3));
    const sceneLifeChanged = sceneLife?.tick(dt, { enabled: motionToggle.checked, mobile: mobileCapture, pixelRatio: renderer.getPixelRatio(), strength: lifeStrength }) || fadeChanged;
    if (sceneLifeChanged) {
      if (liveLayers) atmosphere.invalidateDynamic();
      else atmosphere.invalidateScene();
      directDirty = true;
    }
    const revealLightWeight = reduced.matches ? 0 : firstReveal.weight;
    if (introLight && (sceneLife || revealLightWeight > 0 || revealLightApplied)) {
      const base = sceneLife ? sceneLife.lightPosition(introLightPosition(1, assemblyPose.cameraMix), liveLayers ? 0 : 1).toArray() : introLightPosition(1, assemblyPose.cameraMix);
      const previous = introLight.position.clone();
      introLight.position.fromArray(firstRevealLight(base, revealLightWeight, firstReveal.travel, firstReveal.sector));
      introLight.lookAt(0, 6, 0);
      introLight.intensity *= 1 + 0.72 * revealLightWeight;
      if (!previous.equals(introLight.position) || revealLightWeight > 0 || revealLightApplied) {
        atmosphere.invalidateScene();
        directDirty = true;
      }
      revealLightApplied = revealLightWeight > 0;
    }
    if (motionToggle.checked) time += dt;
    const interiorEnabled = stageA2 && motionToggle.checked && navigation.requested === navigation.active && !navigation.route && assemblyPose.cameraMix > 0.72;
    if (interiorMotion.tick(dt, { module: rigs[navigation.active]?.module, enabled: interiorEnabled, fps: mobileCapture ? 12 : 30, frameReady: !sceneLife || sceneLifeChanged })) {
      if (liveLayers) atmosphere.invalidateDynamic();
      else atmosphere.invalidateScene();
      directDirty = true;
    }
    lightBlend.tick(dt);
    if (lightUniform.value !== lightBlend.value) {
      lightUniform.value = lightBlend.value;
      invalidateScene();
    }
    updatePortraitMist(time, steam);
    const assemblyStatus = selectionError || loadingSector || navigation.status;
    if (assemblyStatus !== lastStatus) {
      status.value = assemblyStatus;
      lastStatus = assemblyStatus;
      if (embedded) window.parent.postMessage({ type: "vaisen-scene-status", message: assemblyStatus }, location.origin);
    }
    const story = assemblyPose.cameraMix > 0.5 ? navigation.active : "core";
    if (story !== currentStory) {
      currentStory = story;
      title.textContent = story === "cgi" ? "CGI" : story === "music" ? "MUSIC" : story === "smart-light" ? "SMART LIGHT" : story === "web" ? "WEB" : "VAISEN";
      description.innerHTML = story === "cgi" ? 'Art direction, product imagery<br class="desktop-break" /> and cinematic motion.' : story === "music" ? "Original music." : story === "smart-light" ? 'Architectural lighting<br class="desktop-break" /> and adaptive spaces.' : story === "web" ? 'Digital identities, websites<br class="desktop-break" /> and interactive products.' : coreDescription;
      disciplines.textContent = story === "cgi" ? "Render infrastructure / Production studio / CGI stage" : story === "music" ? "Impact recording / Composition / Picture mixing" : story === "smart-light" ? "Quiet living / Meeting / Daylight atelier" : story === "web" ? "Identity gallery / Product studio / Responsive lab" : "Digital / CGI / Music / Spatial";
      titleBlock.classList.toggle("is-inspecting", story !== "core");
    }
    assemblyCaption.textContent = mechanism.time > 0 ? navigation.active === "music" ? "MUSIC / SCORING" : navigation.active === "smart-light" ? "LIGHT / SPATIAL" : navigation.active === "web" ? "WEB / DIGITAL" : "CGI / PRODUCTION" : navigation.route ? "TOWER / TRANSIT" : "VAISEN CORE";
    const captureScale = 1, fogScale = 1;
    atmosphere.setLayered(liveLayers && mobileCapture && !navigation.busy && !floorFocus.busy && !cameraChanged && lightBlend.value === lightBlend.target);
    if (atmosphereToggle.checked) atmosphere.render(scene, camera, time, steam, stageA2 ? inspectionAtmosphere() : 1, assemblyPose.releaseMist, releaseFX, captureScale, fogScale);
    else if (captureAA === "hybrid" || captureAA === "fxaa") atmosphere.renderWithoutAtmosphere(scene, camera, captureScale);
    else if (directDirty || handover) {
      renderer.render(scene, camera);
      directDirty = false;
    }
    if (handover && !handover.render(dt)) handover = null;
    if (shaderFailure) {
      renderer.setAnimationLoop(null);
      status.dataset.ready = "false";
      status.value = "Shader unavailable";
      status.setAttribute("role", "alert");
      retry.hidden = false;
      if (embedded) window.parent.postMessage({ type: "vaisen-scene-error" }, location.origin);
    }
  });
}
start().catch(async (error) => {
  console.error(error);
  status.value = "Scene unavailable";
  status.setAttribute("role", "alert");
  retry.hidden = false;
  if (embedded) window.parent.postMessage({ type: "vaisen-scene-error" }, location.origin);
});
