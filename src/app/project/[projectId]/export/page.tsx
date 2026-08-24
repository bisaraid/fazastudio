"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProjectStore } from "@/lib/store/projectStore";
import { usePipeline } from "@/hooks/usePipeline";
import { Navbar } from "@/components/layout/navbar";
import { PipelineStepper } from "@/components/layout/pipeline-stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Download,
  FileText,
  Music,
  Subtitles,
  Video,
  Share2,
  CheckCircle2,
  Loader2,
  FileDown,
  Headphones,
  MessageSquareText,
  FileVideo,
} from "lucide-react";

export default function ExportPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { currentProject, setCurrentProject, loadProjects } = useProjectStore();
  const { exportProject } = usePipeline();
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadProjects();
    setCurrentProject(projectId);
  }, [projectId, loadProjects, setCurrentProject]);

  const handleExportZip = async () => {
    setIsExporting(true);
    try {
      await exportProject(projectId);
    } finally {
      setIsExporting(false);
    }
  };

  // ===== DOWNLOAD PER-FILE =====
  const downloadBlob = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadUrl = (filename: string, url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadVideo = () => {
    if (!currentProject?.video?.url) return;
    downloadUrl(`${currentProject.title || "video"}.mp4`, currentProject.video.url);
  };

  const handleDownloadAudio = () => {
    if (!currentProject?.audio?.url) return;
    downloadUrl(`${currentProject.title || "audio"}.mp3`, currentProject.audio.url);
  };

  const handleDownloadSrt = () => {
    if (!currentProject?.subtitle?.srtContent) return;
    downloadBlob(`${currentProject.title || "subtitle"}.srt`, currentProject.subtitle.srtContent, "text/plain");
  };

  const handleDownloadVtt = () => {
    if (!currentProject?.subtitle?.vttContent) return;
    downloadBlob(`${currentProject.title || "subtitle"}.vtt`, currentProject.subtitle.vttContent, "text/vtt");
  };

  const handleDownloadScript = () => {
    if (!currentProject) return;
    const scriptText =
      currentProject.script?.fullScript ||
      currentProject.script?.scenes?.map((s: any) => s.content).join("\n\n") ||
      "";
    if (scriptText) {
      downloadBlob(`${currentProject.title || "script"}.txt`, scriptText, "text/plain");
    }
  };

  if (!currentProject) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Memuat project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6 lg:px-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push(`/project/${projectId}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Export & Publish</h1>
              <p className="text-sm text-muted-foreground">{currentProject.title}</p>
            </div>
          </div>
          <Button variant="outline" className="gap-2">
            <Share2 className="h-4 w-4" />
            Publish (Coming Soon)
          </Button>
        </div>

        {/* Pipeline Stepper */}
        <PipelineStepper
          currentStep={currentProject.currentStep}
          steps={currentProject.steps}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Video Preview */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Preview Video</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-video rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  <div className="text-center">
                    <Video className="h-16 w-16 text-primary/50 mx-auto mb-3" />
                    <p className="text-lg font-medium">AutoContent Studio</p>
                    <p className="text-sm text-muted-foreground">{currentProject.title}</p>
                    {currentProject.video && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Durasi: {currentProject.video.duration}s •{" "}
                        {currentProject.video.resolution}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ringkasan Project</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Genre</span>
                    <p className="font-medium">{currentProject.genre}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Platform</span>
                    <p className="font-medium">{currentProject.platform}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Durasi</span>
                    <p className="font-medium">{currentProject.targetDuration}s</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="success">Selesai</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Download Options */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Download & Export</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DownloadOption
                  icon={FileVideo}
                  label="Video MP4"
                  description="Full video dengan audio & subtitle"
                  size={currentProject.video?.fileSize}
                  onClick={handleDownloadVideo}
                />
                <DownloadOption
                  icon={Headphones}
                  label="Audio Only (MP3)"
                  description="Hanya audio terpisah"
                  size={currentProject.audio?.fileSize}
                  onClick={handleDownloadAudio}
                />
                <DownloadOption
                  icon={MessageSquareText}
                  label="Subtitle (SRT)"
                  description="File subtitle format SRT"
                  onClick={handleDownloadSrt}
                />
                <DownloadOption
                  icon={MessageSquareText}
                  label="Subtitle (VTT)"
                  description="File subtitle format WebVTT"
                  onClick={handleDownloadVtt}
                />
                <DownloadOption
                  icon={FileText}
                  label="Script Text"
                  description="Full script dalam format teks"
                  onClick={handleDownloadScript}
                />
                <Button
                  onClick={handleExportZip}
                  disabled={isExporting}
                  className="w-full gap-2"
                  size="lg"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Mengemas file...
                    </>
                  ) : (
                    <>
                      <FileDown className="h-4 w-4" />
                      Download ZIP (Semua File)
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Publish ke Platform</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-12"
                  disabled
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.9 2.89 2.89 0 01-2.88-2.89 2.89 2.89 0 012.88-2.89c.6 0 1.15.19 1.62.5V7.72a6.37 6.37 0 00-1.62-.22 6.33 6.33 0 00-6.32 6.33A6.33 6.33 0 0012 20.17a6.33 6.33 0 006.33-6.33v-1.7a8.28 8.28 0 003.45-3.45z" />
                  </svg>
                  TikTok — Coming Soon
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-12"
                  disabled
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.5 6.19a3.02 3.02 0 00-2.14-2.14C19.56 3.5 12 3.5 12 3.5s-7.56 0-9.36.55A3.02 3.02 0 00.5 6.19 31.6 31.6 0 000 12a31.6 31.6 0 00.5 5.81 3.02 3.02 0 002.14 2.14c1.8.55 9.36.55 9.36.55s7.56 0 9.36-.55a3.02 3.02 0 002.14-2.14A31.6 31.6 0 0024 12a31.6 31.6 0 00-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z" />
                  </svg>
                  YouTube — Coming Soon
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-12"
                  disabled
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="2" y="2" width="20" height="20" rx="5" />
                  </svg>
                  Instagram — Coming Soon
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function DownloadOption({
  icon: Icon,
  label,
  description,
  size,
  onClick,
}: {
  icon: any;
  label: string;
  description: string;
  size?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full p-3 rounded-lg border hover:bg-accent transition-colors text-left"
    >
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {size && (
        <span className="text-xs text-muted-foreground shrink-0">
          {(size / 1024 / 1024).toFixed(1)} MB
        </span>
      )}
      <Download className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}