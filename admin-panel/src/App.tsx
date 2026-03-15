import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { Orders } from './pages/Orders'
import { Reviews } from './pages/Reviews'

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm border-b border-gray-200 px-6 py-3 flex gap-4">
        <Link
          to="/admin/orders"
          className="text-gray-700 hover:text-gray-900 font-medium"
        >
          Orders
        </Link>
        <Link
          to="/admin/reviews"
          className="text-gray-700 hover:text-gray-900 font-medium"
        >
          Reviews
        </Link>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/admin/orders" replace />} />
        <Route path="/admin/orders" element={<Orders />} />
        <Route path="/admin/reviews" element={<Reviews />} />
      </Routes>
    </div>
  )
}

export default App
