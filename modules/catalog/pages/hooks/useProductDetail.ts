import { useQuery } from "@tanstack/react-query";
import { getMockProductDetail } from "../product-details/mock";

export const useProductDetail = (id?: string) => {
  return useQuery({
    queryKey: ["catalog", "product-detail", id ?? "default"],
    queryFn: () => getMockProductDetail(id),
    staleTime: 1000 * 60 * 5,
  });
};
