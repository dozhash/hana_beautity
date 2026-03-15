import { Routes, Route, Navigate } from 'react-router-dom'
import { Header } from './components/Header'
import { BottomNav } from './components/BottomNav'
import { TelegramBackButton } from './components/TelegramBackButton'
import { Products } from './pages/Products'
import { ProductDetail } from './pages/ProductDetail'
import { Cart } from './pages/Cart'
import { Orders } from './pages/Orders'
import { OrderDetail } from './pages/OrderDetail'

function App() {
  return (
    <>
      <TelegramBackButton />
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/products" replace />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
      </Routes>
      <BottomNav />
    </>
  )
}

export default App
