import { CheckInPanel } from "@/components/check-in-panel"
import { Shield } from "lucide-react"

const TOPO_PROPS = { fill: "none", stroke: "#b0b0b0", strokeWidth: 1, opacity: 0.7 }

export default function CheckInApp() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#e8e8e8] flex flex-col">
      {/* Topographic SVG background — attributes inline to avoid global style bleed */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <path {...TOPO_PROPS} d="M-100,80 Q200,20 500,90 Q800,160 1100,70 Q1400,0 1600,60" />
        <path {...TOPO_PROPS} d="M-100,160 Q200,100 500,170 Q800,240 1100,150 Q1400,80 1600,140" />
        <path {...TOPO_PROPS} d="M-100,240 Q200,180 500,250 Q800,320 1100,230 Q1400,160 1600,220" />
        <path {...TOPO_PROPS} d="M-100,320 Q200,260 500,330 Q800,400 1100,310 Q1400,240 1600,300" />
        <path {...TOPO_PROPS} d="M-100,400 Q200,340 500,410 Q800,480 1100,390 Q1400,320 1600,380" />
        <path {...TOPO_PROPS} d="M-100,480 Q200,420 500,490 Q800,560 1100,470 Q1400,400 1600,460" />
        <path {...TOPO_PROPS} d="M-100,560 Q200,500 500,570 Q800,640 1100,550 Q1400,480 1600,540" />
        <path {...TOPO_PROPS} d="M-100,640 Q200,580 500,650 Q800,720 1100,630 Q1400,560 1600,620" />
        <path {...TOPO_PROPS} d="M-100,720 Q200,660 500,730 Q800,800 1100,710 Q1400,640 1600,700" />
        <path {...TOPO_PROPS} d="M-100,800 Q200,740 500,810 Q800,880 1100,790 Q1400,720 1600,780" />
        <path {...TOPO_PROPS} d="M100,-50 Q150,200 80,450 Q20,700 120,950" />
        <path {...TOPO_PROPS} d="M300,-50 Q350,200 280,450 Q220,700 320,950" />
        <path {...TOPO_PROPS} d="M500,-50 Q550,200 480,450 Q420,700 520,950" />
        <path {...TOPO_PROPS} d="M700,-50 Q750,200 680,450 Q620,700 720,950" />
        <path {...TOPO_PROPS} d="M900,-50 Q950,200 880,450 Q820,700 920,950" />
        <path {...TOPO_PROPS} d="M1100,-50 Q1150,200 1080,450 Q1020,700 1120,950" />
        <path {...TOPO_PROPS} d="M1300,-50 Q1350,200 1280,450 Q1220,700 1320,950" />
      </svg>

      {/* Main content */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8 py-12">
        <h1 className="text-5xl font-semibold text-gray-800 mb-2 text-center tracking-tight">Security Check-in</h1>
        <p className="text-gray-600 mb-12 text-center font-medium">Verify visitor identity</p>
        <CheckInPanel />
      </div>

      {/* VMS badge bottom-left */}
      <div className="absolute bottom-6 left-6 z-10 flex items-center gap-2 text-gray-600">
        <Shield className="h-4 w-4" />
        <span className="text-sm font-medium">VMS</span>
      </div>
    </main>
  )
}
