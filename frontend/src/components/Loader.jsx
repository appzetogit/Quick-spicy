import { Loader2 } from "lucide-react"

export default function Loader() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-white dark:bg-[#0a0a0a]">
            <Loader2 className="h-10 w-10 animate-spin text-primary-orange dark:text-primary-orange" />
        </div>
    )
}
