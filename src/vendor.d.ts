// File ini dinetralkan (kosong) karena dependency @ffmpeg/ffmpeg, @ffmpeg/util,
// dan jszip sudah ter-install via npm install manual.
// Hapus file ini secara manual jika masih ada.

// Type declaration untuk midtrans-client (CommonJS, tanpa bundled types)
declare module "midtrans-client" {
  interface SnapOptions {
    isProduction?: boolean;
    serverKey?: string;
    clientKey?: string;
  }

  interface SnapResponse {
    token: string;
    redirect_url?: string;
  }

  class Snap {
    constructor(options?: SnapOptions);
    createTransaction(parameter: Record<string, unknown>): Promise<SnapResponse>;
  }

  interface MidtransNamespace {
    Snap: typeof Snap;
    CoreApi: unknown;
  }

  const Midtrans: MidtransNamespace;
  export = Midtrans;
}