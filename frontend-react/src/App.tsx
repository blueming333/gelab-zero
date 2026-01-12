import { AppShell, Group, Button, Text, rem } from '@mantine/core'
import { IconHistory, IconHome } from '@tabler/icons-react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import HomePage from './pages/Home'
import HistoryPage from './pages/History'

function App() {
  const location = useLocation()
  const navigate = useNavigate()

  const isHistory = location.pathname.startsWith('/history')

  return (
    <AppShell
      padding="md"
      header={{ height: 64 }}
      styles={{
        main: {
          background: 'radial-gradient(circle at 20% 20%, rgba(0, 91, 255, 0.05), transparent 25%), radial-gradient(circle at 80% 0%, rgba(56, 189, 248, 0.08), transparent 25%), #f5f6fa',
          paddingTop: rem(12),
        },
      }}
      withBorder={false}
    >
      <AppShell.Header px="md" py="sm" className="app-header">
        <Group justify="space-between">
          <Group gap="sm">
            <Text fw={700} fz="lg">
              实时任务跟踪（React 重构版）
            </Text>
          </Group>
          <Group gap="sm">
            {!isHistory && (
              <Button leftSection={<IconHistory size={16} />} onClick={() => navigate('/history')}>
                历史记录
              </Button>
            )}
            {isHistory && (
              <Button variant="light" leftSection={<IconHome size={16} />} onClick={() => navigate('/')}>
                返回首页
              </Button>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main className="app-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  )
}

export default App
