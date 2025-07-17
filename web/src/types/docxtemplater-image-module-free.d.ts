declare module 'docxtemplater-image-module-free' {
  interface ImageModuleOptions {
    centered?: boolean;
    getImage?: (tagValue: string) => ArrayBuffer;
    getSize?: (img: ArrayBuffer, tagValue: string) => [number, number];
  }

  class ImageModule {
    constructor(options?: ImageModuleOptions);
  }

  export = ImageModule;
} 