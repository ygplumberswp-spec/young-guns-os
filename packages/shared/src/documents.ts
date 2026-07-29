export type DocumentCategorySummary = {
  id: string;
  name: string;
  description: string | null;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DocumentSummary = {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  categoryId: string | null;
  categoryName: string | null;
  customerId: string | null;
  customerName: string | null;
  jobId: string | null;
  jobTitle: string | null;
  uploadedByUserId: string;
  uploadedByName: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentDetail = DocumentSummary;

export type DocumentsStats = {
  documentCount: number;
  categoryCount: number;
};

export type CreateDocumentCategoryRequest = {
  name: string;
  description?: string | null;
};

export type CreateDocumentRequest = {
  title: string;
  description?: string | null;
  fileName: string;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  categoryId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
};

export type UpdateDocumentRequest = {
  title?: string;
  description?: string | null;
  fileName?: string;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  categoryId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
};
