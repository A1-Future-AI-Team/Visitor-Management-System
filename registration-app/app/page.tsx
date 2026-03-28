import { VisitorRegistration } from "@/components/visitor-registration"

const TOPO_PROPS = { fill: "none", stroke: "#a89ec8", strokeWidth: 1, opacity: 0.6 }

const TopoBackground = () => (
  <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <path {...TOPO_PROPS} d="M-100,60 Q250,10 600,70 Q950,130 1300,50 Q1600,0 1900,55" />
    <path {...TOPO_PROPS} d="M-100,130 Q250,80 600,140 Q950,200 1300,120 Q1600,60 1900,125" />
    <path {...TOPO_PROPS} d="M-100,200 Q250,150 600,210 Q950,270 1300,190 Q1600,130 1900,195" />
    <path {...TOPO_PROPS} d="M-100,270 Q250,220 600,280 Q950,340 1300,260 Q1600,200 1900,265" />
    <path {...TOPO_PROPS} d="M-100,340 Q250,290 600,350 Q950,410 1300,330 Q1600,270 1900,335" />
    <path {...TOPO_PROPS} d="M-100,410 Q250,360 600,420 Q950,480 1300,400 Q1600,340 1900,405" />
    <path {...TOPO_PROPS} d="M-100,480 Q250,430 600,490 Q950,550 1300,470 Q1600,410 1900,475" />
    <path {...TOPO_PROPS} d="M-100,550 Q250,500 600,560 Q950,620 1300,540 Q1600,480 1900,545" />
    <path {...TOPO_PROPS} d="M-100,620 Q250,570 600,630 Q950,690 1300,610 Q1600,550 1900,615" />
    <path {...TOPO_PROPS} d="M-100,690 Q250,640 600,700 Q950,760 1300,680 Q1600,620 1900,685" />
    <path {...TOPO_PROPS} d="M80,-30 Q120,200 70,430 Q30,660 100,900" />
    <path {...TOPO_PROPS} d="M280,-30 Q320,200 270,430 Q230,660 300,900" />
    <path {...TOPO_PROPS} d="M480,-30 Q520,200 470,430 Q430,660 500,900" />
    <path {...TOPO_PROPS} d="M680,-30 Q720,200 670,430 Q630,660 700,900" />
    <path {...TOPO_PROPS} d="M880,-30 Q920,200 870,430 Q830,660 900,900" />
    <path {...TOPO_PROPS} d="M1080,-30 Q1120,200 1070,430 Q1030,660 1100,900" />
    <path {...TOPO_PROPS} d="M1280,-30 Q1320,200 1270,430 Q1230,660 1300,900" />
    <path {...TOPO_PROPS} d="M1480,-30 Q1520,200 1470,430 Q1430,660 1500,900" />
    <ellipse {...TOPO_PROPS} cx="400" cy="350" rx="220" ry="140" />
    <ellipse {...TOPO_PROPS} cx="1100" cy="200" rx="180" ry="120" />
    <ellipse {...TOPO_PROPS} cx="900" cy="600" rx="160" ry="100" />
  </svg>
)

export default function RegistrationApp() {
  return (
    <main className="relative min-h-screen bg-[#eeecf5] overflow-hidden flex items-center justify-center px-4 py-12">
      <TopoBackground />
      <div className="relative z-10 w-full max-w-md">
        <VisitorRegistration />
      </div>
    </main>
  )
}
