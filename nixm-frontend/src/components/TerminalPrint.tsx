import { useState, useEffect } from 'react';
import styled from 'styled-components';

interface Props {
    lines: string[];
    delay?: number;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Line = styled.span`
    font-size: var(--fz-sm);
    color: var(--green-mid);
    animation: fadeIn 0.3s ease-in-out;

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    &::before {
        content: '> ';
        color: var(--green);
    }
`;

const TerminalPrint = ({ lines, delay = 800 }: Props) => {
    const [visible, setVisible] = useState<string[]>([]);

    useEffect(() => {
        lines.forEach((line, i) => {
            setTimeout(() => {
                setVisible(prev => [...prev, line]);
            }, i * delay);
        });
    }, []);

    return (
        <Container>
            {visible.map((line, i) => (
                    <Line key={i}>{line}</Line>
                ))}
        </Container>
    );
};



export default TerminalPrint;
