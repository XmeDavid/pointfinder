import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GameResultCard } from './GameResultCard'
const reward = vi.hoisted(()=>vi.fn())
vi.mock('@/app/player/services',()=>({useServices:()=>({client:{api:{player:{reward}}}})}))
function mount() {return render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><GameResultCard gameId="game-1" stateVersion={1}/></QueryClientProvider></MemoryRouter>)}
beforeEach(()=>reward.mockReset())
it('does not present pending XP or placement as a final result', async()=>{
  reward.mockResolvedValue({state:'pending',xp:99,placement:{placement:1,teams:2}})
  mount()
  await screen.findByRole('status')
  expect(screen.queryByText('+99 XP')).not.toBeInTheDocument()
  expect(screen.queryByText('Place 1 of 2')).not.toBeInTheDocument()
})
it('presents the finalized shared result and lets a guest keep it', async()=>{
  reward.mockResolvedValue({state:'finalized',xp:71,placement:{placement:1,teams:2,tied:false,completed:true},level:null})
  mount()
  expect(await screen.findByText('+71 XP')).toBeVisible()
  expect(screen.getByText('Place 1 of 2')).toBeVisible()
  expect(screen.getByRole('link',{name:'Save your progress'})).toHaveAttribute('href','/account')
})
