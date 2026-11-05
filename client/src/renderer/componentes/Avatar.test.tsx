// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Avatar } from './Avatar';

afterEach(cleanup);

describe('Avatar', () => {
  it('mostra a foto; se ela falhar, cai na inicial com a cor do perfil', () => {
    const { container } = render(<Avatar usuario={{ nomeExibicao: 'bia', cor: '#ff8800', avatarUrl: '/files/x.webp' }} servidorUrl="http://s" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('http://s/files/x.webp');
    fireEvent.error(img);
    const inicial = container.querySelector('.avatar-inicial') as HTMLElement;
    expect(inicial.textContent).toBe('B');
    expect(inicial.style.background).toBe('rgb(255, 136, 0)');
  });
});
