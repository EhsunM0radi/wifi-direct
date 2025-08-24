export function Logo(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            {...props}
        >
            <path d="M10.1 12.4 4.5 20" />
            <path d="m13.9 12.4 5.6 7.6" />
            <path d="M12 22V15.5" />
            <path d="M13.9 11.6 19.5 4" />
            <path d="m10.1 11.6-5.6-7.6" />
            <path d="M12 2v6.5" />
        </svg>
    );
}
