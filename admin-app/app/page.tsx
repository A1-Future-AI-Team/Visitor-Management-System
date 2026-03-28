import { AdminPanel } from "@/components/admin-panel"
import { Shield } from "lucide-react"

const TOPO_STROKE = "#b8b0d0"
const TOPO_PROPS = { fill: "none", stroke: TOPO_STROKE, strokeWidth: 1, opacity: 0.5 }

const TopoBackground = () => (
  <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <path {...TOPO_PROPS} d="M-100,80 Q400,20 900,90 Q1400,160 1900,70" />
    <path {...TOPO_PROPS} d="M-100,180 Q400,120 900,190 Q1400,260 1900,170" />
    <path {...TOPO_PROPS} d="M-100,280 Q400,220 900,290 Q1400,360 1900,270" />
    <path {...TOPO_PROPS} d="M-100,380 Q400,320 900,390 Q1400,460 1900,370" />
    <path {...TOPO_PROPS} d="M-100,480 Q400,420 900,490 Q1400,560 1900,470" />
    <path {...TOPO_PROPS} d="M-100,580 Q400,520 900,590 Q1400,660 1900,570" />
    <path {...TOPO_PROPS} d="M-100,680 Q400,620 900,690 Q1400,760 1900,670" />
    <path {...TOPO_PROPS} d="M-100,780 Q400,720 900,790 Q1400,860 1900,770" />
    <path {...TOPO_PROPS} d="M100,-20 Q130,300 90,600 Q60,900 110,1100" />
    <path {...TOPO_PROPS} d="M400,-20 Q430,300 390,600 Q360,900 410,1100" />
    <path {...TOPO_PROPS} d="M700,-20 Q730,300 690,600 Q660,900 710,1100" />
    <path {...TOPO_PROPS} d="M1000,-20 Q1030,300 990,600 Q960,900 1010,1100" />
    <path {...TOPO_PROPS} d="M1300,-20 Q1330,300 1290,600 Q1260,900 1310,1100" />
    <path {...TOPO_PROPS} d="M1600,-20 Q1630,300 1590,600 Q1560,900 1610,1100" />
    <ellipse {...TOPO_PROPS} cx="600" cy="300" rx="300" ry="180" />
    <ellipse {...TOPO_PROPS} cx="1400" cy="600" rx="250" ry="160" />
  </svg>
)

export default function AdminApp() {
  return (
    <main className="relative min-h-screen bg-[#f0eef8] overflow-x-hidden">
      <TopoBackground />
      <header className="relative z-10 border-b bg-white/90 backdrop-blur-md sticky top-0 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">VMS Admin</h1>
            <p className="text-xs text-gray-500">Management Console</p>
          </div>
        </div>
      </header>
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-6">
        <AdminPanel />
      </div>
    </main>
  )
}
