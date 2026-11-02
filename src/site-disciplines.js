const DISCIPLINES = { cgi: { label: "CGI & image", number: "02", work: "#vyshe", chapters: [{ floor: 1, place: "Production studio", title: "Before it\nexists.", body: "Product images and architectural visualisation. I build the model, work out the materials and light the scene for the final image." }, { floor: 2, place: "CGI stage", title: "See it\nin motion.", body: "A moving camera shows how a surface catches the light and how an object sits in space. This is where still images become short films." }, { floor: 0, place: "Render infrastructure", title: "Inside\nthe render.", body: "The scene behind the image: models, textures and lighting. I also build real-time scenes you can explore directly in a browser." }] }, music: { label: "Original music", number: "03", work: "#music", chapters: [{ floor: 1, place: "Composition room", title: "Original\nmusic.", body: "" }, { floor: 2, place: "Picture mixing", title: "Picture\nmixing.", body: "" }, { floor: 0, place: "Impact room", title: "Sound\ndesign.", body: "" }] }, web: { label: "Web & interactive", number: "01", work: "#vyshe", chapters: [{ floor: 1, place: "Product studio", title: "From design\nto a live site.", body: "I design websites and build them. Layout, typography and interaction are worked out together, then tested in the browser." }, { floor: 2, place: "Responsive lab", title: "Built for\nyour screen.", body: "A layout needs its own composition on a phone. I adapt the type, controls and 3D camera so the experience fits the screen." }, { floor: 0, place: "Identity gallery", title: "Start with\nthe identity.", body: "A website needs a recognisable visual language. I work with type, colour and imagery before carrying them through the pages." }] }, "smart-light": { label: "Light & space", number: "04", work: "#vyshe", chapters: [{ floor: 1, place: "Meeting space", title: "The room\nafter dark.", body: "Lighting concepts for architectural spaces. Digital scenes let you compare the position, colour and intensity of the light." }, { floor: 2, place: "Daylight atelier", title: "As daylight\nchanges.", body: "Natural light changes the way materials look throughout the day. I use 3D studies to explore where artificial light is needed." }, { floor: 0, place: "Quiet living", title: "An evening\nat home.", body: "Lower, warmer light changes the same interior. This study explores lamps, reflected light and the areas left in shadow." }] } };
class DisciplineDeck {
  constructor() {
    this.sector = "core";
    this.indices = new Map();
  }
  select(sector) {
    if (sector !== "core" && !DISCIPLINES[sector]) return false;
    this.sector = sector;
    return true;
  }
  get index() {
    return this.indices.get(this.sector) ?? 0;
  }
  get story() {
    return DISCIPLINES[this.sector];
  }
  get chapter() {
    return this.story?.chapters[this.index];
  }
  go(index) {
    if (!this.story || !Number.isInteger(index) || index < 0 || index >= this.story.chapters.length || index === this.index) return false;
    this.indices.set(this.sector, index);
    return true;
  }
}
export {
  DISCIPLINES,
  DisciplineDeck
};
