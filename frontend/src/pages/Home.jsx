import { Link } from "react-router-dom"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

export default function Home() {
  const companyName = useCompanyName()
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-4xl font-bold mb-2">{companyName} 🍔</CardTitle>
          <CardDescription className="text-lg">
            Welcome to the Food Delivery Platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <Link to="/user" className="block">
              <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center">
                <span className="text-2xl mb-2">👤</span>
                <span className="font-semibold">User</span>
              </Button>
            </Link>
            <Link to="/restaurant" className="block">
              <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center">
                <span className="text-2xl mb-2">🍽️</span>
                <span className="font-semibold">Restaurant</span>
              </Button>
            </Link>
            <Link to="/restaurant/auth/sign-in" className="block">
              <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center border-2 border-[#ff8100] hover:bg-[#ff8100]/10">
                <span className="text-2xl mb-2">🔐</span>
                <span className="font-semibold">Restaurant Login</span>
              </Button>
            </Link>
            <Link to="/delivery" className="block">
              <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center">
                <span className="text-2xl mb-2">🚚</span>
                <span className="font-semibold">Delivery</span>
              </Button>
            </Link>
            <Link to="/admin/login" className="block">
              <Button variant="outline" className="w-full h-24 flex flex-col items-center justify-center">
                <span className="text-2xl mb-2">🛡️</span>
                <span className="font-semibold">Admin</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

