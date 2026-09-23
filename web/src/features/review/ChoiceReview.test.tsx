import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ChoiceReview } from './ChoiceReview'

const options = [
  { id: 'a', text: 'Oak', correct: true },
  { id: 'b', text: 'Pine', correct: false },
  { id: 'c', text: 'Birch', correct: true },
]

describe('ChoiceReview', () => {
  it('marks what the team chose next to the answer key, in option order', () => {
    render(<ChoiceReview options={options} selectedOptionIds={['b', 'a']} answer="Oak; Pine" />)
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((r) => r.textContent)).toEqual(['OakChosenCorrect', 'PineChosen', 'BirchCorrect'])
    expect(within(rows[2]).queryByText('Chosen')).not.toBeInTheDocument()
    expect(screen.queryByTestId('choice-review-orphaned')).not.toBeInTheDocument()
  })

  it('keeps the chosen text when an option was removed after the answer', () => {
    render(<ChoiceReview options={options} selectedOptionIds={['gone']} answer="Larch" />)
    expect(screen.getByTestId('choice-review-orphaned')).toHaveTextContent('removed after this answer. (Larch)')
  })
})
